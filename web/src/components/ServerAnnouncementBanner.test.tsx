// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DISMISSED_KEY, ServerAnnouncementBanner } from './ServerAnnouncementBanner'

const notice = { id: 'rel-1', text: 'Đã có bản mới', level: 'warning', link: 'https://example.com/r', linkLabel: null }

function serve(announcement: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ announcement }), { status })))
}

beforeEach(() => localStorage.removeItem(DISMISSED_KEY))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function mount() {
  await act(async () => { render(<ServerAnnouncementBanner lang="vi" />) })
}

it('shows plain text with an https link and, by default, no close button', async () => {
  serve({ ...notice, text: '<b>x</b>' })
  await mount()
  const strip = screen.getByTestId('server-announcement')
  expect(strip.textContent).toContain('<b>x</b>')
  expect(strip.querySelector('b')).toBeNull()
  expect(screen.getByRole('link').getAttribute('href')).toBe(notice.link)
  expect(screen.queryByRole('button')).toBeNull()
})

it('ignores a stored dismissal unless the notice is explicitly dismissible', async () => {
  localStorage.setItem(DISMISSED_KEY, 'rel-1')
  serve(notice)
  await mount()
  expect(screen.getByTestId('server-announcement')).toBeTruthy()
})

it('explicitly dismissible notices can be closed and stay closed for that id', async () => {
  serve({ ...notice, dismissible: true })
  await mount()
  fireEvent.click(screen.getByRole('button'))
  expect(screen.queryByTestId('server-announcement')).toBeNull()
  expect(localStorage.getItem(DISMISSED_KEY)).toBe('rel-1')
})

it('hides when there is nothing to show or the request fails', async () => {
  serve(null)
  await mount()
  expect(screen.queryByTestId('server-announcement')).toBeNull()
  cleanup()
  serve(null, 401)
  await mount()
  expect(screen.queryByTestId('server-announcement')).toBeNull()
})
