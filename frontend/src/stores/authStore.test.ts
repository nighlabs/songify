import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAuthStore.setState({
      token: null,
      sessionId: null,
      isAdmin: false,
      displayName: null,
      identity: null,
      friendAccessKey: null,
    })
  })

  it('should initialize with null values', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.sessionId).toBeNull()
    expect(state.isAdmin).toBe(false)
    expect(state.displayName).toBeNull()
    expect(state.friendAccessKey).toBeNull()
  })

  it('should set admin auth correctly', () => {
    const { setAdminAuth } = useAuthStore.getState()
    setAdminAuth('admin-token', 'session-123', 'Test Session', 'happy-tiger-42')

    const state = useAuthStore.getState()
    expect(state.token).toBe('admin-token')
    expect(state.sessionId).toBe('session-123')
    expect(state.isAdmin).toBe(true)
    expect(state.displayName).toBe('Test Session')
    expect(state.friendAccessKey).toBe('happy-tiger-42')
  })

  it('should set friend auth correctly', () => {
    const { setFriendAuth } = useAuthStore.getState()
    setFriendAuth('friend-token', 'session-456', 'Party Playlist', 'Chris [HappyTiger42]')

    const state = useAuthStore.getState()
    expect(state.token).toBe('friend-token')
    expect(state.sessionId).toBe('session-456')
    expect(state.isAdmin).toBe(false)
    expect(state.displayName).toBe('Party Playlist')
    expect(state.identity).toBe('Chris [HappyTiger42]')
    expect(state.friendAccessKey).toBeNull()
  })

  it('should logout correctly', () => {
    const { setAdminAuth, logout } = useAuthStore.getState()
    setAdminAuth('admin-token', 'session-123', 'Test', 'key')

    logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.sessionId).toBeNull()
    expect(state.isAdmin).toBe(false)
    expect(state.displayName).toBeNull()
    expect(state.friendAccessKey).toBeNull()
  })

  it('should report authenticated status correctly', () => {
    const store = useAuthStore.getState()
    expect(store.isAuthenticated()).toBe(false)

    store.setFriendAuth('token', 'session', 'name', 'TestUser [Auto1]')

    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })
})
