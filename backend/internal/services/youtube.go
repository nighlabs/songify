package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	for i, item := range searchResp.Items {
		thumbnailURL := item.Snippet.Thumbnails.Medium.URL
		if thumbnailURL == "" {
			thumbnailURL = item.Snippet.Thumbnails.Default.URL
		}

		videos[i] = YouTubeVideo{
			ID:           item.ID.VideoID,
			Title:        item.Snippet.Title,
			ChannelTitle: item.Snippet.ChannelTitle,
			ThumbnailURL: thumbnailURL,
		}
	}

	return videos, nil
}
