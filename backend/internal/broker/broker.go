// Package broker provides an in-memory pub/sub mechanism scoped by session ID.
// It is used to notify SSE connections when song requests change.
package broker

import "sync"

// Broker is a session-scoped pub/sub hub. Subscribers receive a signal (empty struct)
// whenever Publish is called for their session. Channels are buffered to 1 so
// multiple rapid publishes coalesce into a single notification.
type Broker struct {
	mu   sync.Mutex
	subs map[string]map[chan struct{}]struct{}
}

// New creates a ready-to-use Broker.
func New() *Broker {
	return &Broker{
		subs: make(map[string]map[chan struct{}]struct{}),
	}
}

// Subscribe returns a buffered(1) channel that receives a signal each time
// Publish is called for the given session ID.
func (b *Broker) Subscribe(sessionID string) chan struct{} {
	ch := make(chan struct{}, 1)
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.subs[sessionID] == nil {
		b.subs[sessionID] = make(map[chan struct{}]struct{})
	}
	b.subs[sessionID][ch] = struct{}{}
	return ch
}

// Unsubscribe removes a channel from the session's subscriber set.
// If the session has no remaining subscribers, the entry is cleaned up.
func (b *Broker) Unsubscribe(sessionID string, ch chan struct{}) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if subs, ok := b.subs[sessionID]; ok {
		delete(subs, ch)
		if len(subs) == 0 {
			delete(b.subs, sessionID)
		}
	}
}

// Publish sends a non-blocking signal to every subscriber for the given session.
// Because channels are buffered to 1, a pending unread signal is not duplicated.
func (b *Broker) Publish(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subs[sessionID] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
