package services

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// YouTubeService provides access to the YouTube Data API v3 for video searches.
type YouTubeService struct {
	apiKey     string
	httpClient *http.Client
}

// YouTubeVideo represents a video from YouTube search results.
type YouTubeVideo struct {
	ID           string
	Title        string
	ChannelTitle string
	ThumbnailURL string
	DurationMS   int64
}

type youtubeSearchResponse struct {
	Items []youtubeSearchItem `json:"items"`
}

type youtubeSearchItem struct {
	ID      youtubeVideoID `json:"id"`
	Snippet youtubeSnippet `json:"snippet"`
}

type youtubeVideoID struct {
	VideoID string `json:"videoId"`
}

type youtubeSnippet struct {
	Title        string           `json:"title"`
	ChannelTitle string           `json:"channelTitle"`
	Thumbnails   youtubeThumbnails `json:"thumbnails"`
}

type youtubeThumbnails struct {
	Default youtubeThumbnail `json:"default"`
	Medium  youtubeThumbnail `json:"medium"`
}

type youtubeThumbnail struct {
	URL string `json:"url"`
}

// NewYouTubeService creates a YouTubeService with the given API key.
func NewYouTubeService(apiKey string) *YouTubeService {
	return &YouTubeService{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Search queries YouTube for videos matching the given search string.
func (s *YouTubeService) Search(ctx context.Context, query string, limit int) ([]YouTubeVideo, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	searchURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=%s&maxResults=%d&key=%s",
		url.QueryEscape(query), limit, url.QueryEscape(s.apiKey))

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create search request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("search request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var searchResp youtubeSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode search response: %w", err)
	}

	videos := make([]YouTubeVideo, len(searchResp.Items))
	videoIDs := make([]string, len(searchResp.Items))
	for i, item := range searchResp.Items {
		thumbnailURL := item.Snippet.Thumbnails.Medium.URL
		if thumbnailURL == "" {
			thumbnailURL = item.Snippet.Thumbnails.Default.URL
		}

		videos[i] = YouTubeVideo{
			ID:           item.ID.VideoID,
			Title:        html.UnescapeString(item.Snippet.Title),
			ChannelTitle: html.UnescapeString(item.Snippet.ChannelTitle),
			ThumbnailURL: thumbnailURL,
		}
		videoIDs[i] = item.ID.VideoID
	}

	// Fetch durations via videos.list (1 quota unit)
	durations, err := s.getVideoDurations(ctx, videoIDs)
	if err == nil {
		for i := range videos {
			if d, ok := durations[videos[i].ID]; ok {
				videos[i].DurationMS = d
			}
		}
	}

	return videos, nil
}

// getVideoDurations fetches video durations from the YouTube Videos API.
// Returns a map of videoID -> duration in milliseconds.
func (s *YouTubeService) getVideoDurations(ctx context.Context, videoIDs []string) (map[string]int64, error) {
	if len(videoIDs) == 0 {
		return nil, nil
	}

	videosURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=%s&key=%s",
		url.QueryEscape(strings.Join(videoIDs, ",")), url.QueryEscape(s.apiKey))

	req, err := http.NewRequestWithContext(ctx, "GET", videosURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create videos request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("videos request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("videos request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var videosResp youtubeVideosResponse
	if err := json.NewDecoder(resp.Body).Decode(&videosResp); err != nil {
		return nil, fmt.Errorf("failed to decode videos response: %w", err)
	}

	durations := make(map[string]int64, len(videosResp.Items))
	for _, item := range videosResp.Items {
		durations[item.ID] = parseISO8601Duration(item.ContentDetails.Duration)
	}

	return durations, nil
}

type youtubeVideosResponse struct {
	Items []youtubeVideoItem `json:"items"`
}

type youtubeVideoItem struct {
	ID             string                `json:"id"`
	ContentDetails youtubeContentDetails `json:"contentDetails"`
}

type youtubeContentDetails struct {
	Duration string `json:"duration"`
}

// iso8601Re matches ISO 8601 duration format: PT1H2M3S
var iso8601Re = regexp.MustCompile(`PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?`)

// parseISO8601Duration parses a duration like "PT4M13S" to milliseconds.
func parseISO8601Duration(d string) int64 {
	matches := iso8601Re.FindStringSubmatch(d)
	if matches == nil {
		return 0
	}

	var hours, minutes, seconds int64
	if matches[1] != "" {
		hours, _ = strconv.ParseInt(matches[1], 10, 64)
	}
	if matches[2] != "" {
		minutes, _ = strconv.ParseInt(matches[2], 10, 64)
	}
	if matches[3] != "" {
		seconds, _ = strconv.ParseInt(matches[3], 10, 64)
	}

	return (hours*3600 + minutes*60 + seconds) * 1000
}
