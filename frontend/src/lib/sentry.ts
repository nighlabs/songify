/**
 * Sentry initialization and privacy scrubbing for the frontend.
 *
 * Configures error tracking and Session Replay with aggressive data masking
 * to prevent sensitive information (auth tokens, passwords, localStorage keys)
 * from being captured.
 */

import * as Sentry from '@sentry/react'

/** Sensitive HTTP headers that should never appear in Sentry events */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie']

/** localStorage keys whose values should never appear in breadcrumbs */
const SENSITIVE_STORAGE_KEYS = ['songify-auth', 'spotify-sdk:']

/** Field names that indicate sensitive data in breadcrumb messages */
const SENSITIVE_FIELD_NAMES = ['password', 'passwordHash', 'token', 'secret', 'friendKeyHash', 'adminPassword']

/**
 * Scrub sensitive data from Sentry events before they are sent.
 * Removes Authorization headers and request body data.
 */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request) {
    // Redact sensitive headers
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          event.request.headers[header] = '[Filtered]'
        }
      }
    }
    // Strip request body entirely
    delete event.request.data
  }
  return event
}

/**
 * Filter breadcrumbs that reference sensitive localStorage keys
 * or contain sensitive field names in their messages.
 */
function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  // Drop breadcrumbs referencing sensitive localStorage keys
  if (breadcrumb.category === 'console' || breadcrumb.category === 'ui.click') {
    const message = breadcrumb.message || ''
    for (const key of SENSITIVE_STORAGE_KEYS) {
      if (message.includes(key)) {
        return null
      }
    }
  }

  // Drop storage breadcrumbs for sensitive keys
  if (breadcrumb.data) {
    const dataStr = JSON.stringify(breadcrumb.data)
    for (const key of SENSITIVE_STORAGE_KEYS) {
      if (dataStr.includes(key)) {
        return null
      }
    }
  }

  // Redact messages containing sensitive field names
  if (breadcrumb.message) {
    for (const field of SENSITIVE_FIELD_NAMES) {
      if (breadcrumb.message.includes(field)) {
        breadcrumb.message = '[Filtered]'
        break
      }
    }
  }

  return breadcrumb
}

/**
 * Initialize Sentry with error tracking, performance monitoring,
 * and Session Replay with privacy-first configuration.
 */
export function initSentry(dsn: string, environment: string) {
  Sentry.init({
    dsn,
    environment,
    tunnel: '/api/sentry-tunnel',
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        networkDetailAllowUrls: [],
        networkRequestHeaders: ['Content-Type', 'Accept'],
        networkResponseHeaders: ['Content-Type'],
      }),
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}
