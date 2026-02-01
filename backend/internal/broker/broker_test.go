package broker

import (
	"sync"
	"testing"
	"time"
)

func TestSubscribeAndPublish(t *testing.T) {
	b := New()
	ch := b.Subscribe("sess1")
	defer b.Unsubscribe("sess1", ch)

	b.Publish("sess1")

	select {
	case <-ch:
		// success
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected signal on channel")
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	b := New()
	ch := b.Subscribe("sess1")
	b.Unsubscribe("sess1", ch)

	b.Publish("sess1")

	select {
	case <-ch:
		t.Fatal("should not receive after unsubscribe")
	case <-time.After(50 * time.Millisecond):
		// success
	}
}

func TestCrossSessionIsolation(t *testing.T) {
	b := New()
	ch1 := b.Subscribe("sess1")
	ch2 := b.Subscribe("sess2")
	defer b.Unsubscribe("sess1", ch1)
	defer b.Unsubscribe("sess2", ch2)

	b.Publish("sess1")

	select {
	case <-ch1:
		// expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("sess1 subscriber should have received signal")
	}

	select {
	case <-ch2:
		t.Fatal("sess2 subscriber should not receive signal from sess1 publish")
	case <-time.After(50 * time.Millisecond):
		// expected
	}
}

func TestNonBlockingCoalescing(t *testing.T) {
	b := New()
	ch := b.Subscribe("sess1")
	defer b.Unsubscribe("sess1", ch)

	// Publish multiple times without reading — should not block
	for i := 0; i < 10; i++ {
		b.Publish("sess1")
	}

	// Should receive exactly one signal (coalesced)
	select {
	case <-ch:
		// got the coalesced signal
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected at least one signal")
	}

	// Channel should now be empty
	select {
	case <-ch:
		t.Fatal("expected channel to be drained after one read")
	case <-time.After(50 * time.Millisecond):
		// success
	}
}

func TestMultipleSubscribers(t *testing.T) {
	b := New()
	ch1 := b.Subscribe("sess1")
	ch2 := b.Subscribe("sess1")
	defer b.Unsubscribe("sess1", ch1)
	defer b.Unsubscribe("sess1", ch2)

	b.Publish("sess1")

	for i, ch := range []chan struct{}{ch1, ch2} {
		select {
		case <-ch:
			// expected
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("subscriber %d should have received signal", i)
		}
	}
}

func TestUnsubscribeCleansUpEmptySession(t *testing.T) {
	b := New()
	ch := b.Subscribe("sess1")
	b.Unsubscribe("sess1", ch)

	b.mu.Lock()
	_, exists := b.subs["sess1"]
	b.mu.Unlock()

	if exists {
		t.Fatal("expected session entry to be removed after last unsubscribe")
	}
}

func TestPublishToNonexistentSession(t *testing.T) {
	b := New()
	// Should not panic
	b.Publish("nonexistent")
}

func TestConcurrentAccess(t *testing.T) {
	b := New()
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch := b.Subscribe("sess1")
			b.Publish("sess1")
			<-ch
			b.Unsubscribe("sess1", ch)
		}()
	}

	wg.Wait()
}
