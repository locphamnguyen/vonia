/* Shared voices/presets store + voice resolver (preset -> instruct, user -> voice_id). */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { UIVoice } from '../components/voice-library'

interface VoicesCtx {
  presets: api.Preset[]
  presetByName: Record<string, api.Preset>
  userVoices: api.VoiceRecord[]
  userUIVoices: UIVoice[]
  apiOk: boolean
  apiChecked: boolean   // false until the first connectivity probe resolves
  refresh: () => Promise<void>
  resolve: (name: string) => { voiceId?: string; instruct?: string; seed?: number }
}

/* Stable 31-bit seed from a voice name (FNV-1a). Same name → same seed → same
   designed voice, so each preset/cast voice has a distinct, consistent identity
   instead of a fresh random one each generation. */
function voiceSeed(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0) % 2147483647
}

const Ctx = createContext<VoicesCtx>(null as any)
export function useVoices() { return useContext(Ctx) }

export function VoicesProvider({ children }: { children: React.ReactNode }) {
  const [presets, setPresets] = useState<api.Preset[]>([])
  const [userVoices, setUserVoices] = useState<api.VoiceRecord[]>([])
  const [apiOk, setApiOk] = useState(false)
  const [apiChecked, setApiChecked] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([api.getPresets(), api.listVoices()])
      setPresets(p); setUserVoices(v); setApiOk(true)
    } catch {
      setApiOk(false)
    } finally {
      setApiChecked(true)
    }
  }, [])

  // Initial load + lightweight connectivity poll. The full refresh (presets +
  // voices) only needs to run once; after that a cheap /health probe keeps the
  // offline banner accurate, and re-fetches presets/voices when the backend
  // comes back after having been down.
  useEffect(() => {
    let alive = true
    refresh()
    const id = setInterval(async () => {
      try {
        await api.health()
        if (!alive) return
        setApiOk(prev => { if (!prev) refresh(); return true })  // recovered -> repopulate
      } catch {
        if (alive) setApiOk(false)
      } finally {
        if (alive) setApiChecked(true)
      }
    }, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [refresh])

  const presetByName: Record<string, api.Preset> = {}
  presets.forEach(p => { presetByName[p.name] = p })

  const userUIVoices: UIVoice[] = userVoices.map(v => ({
    name: v.name, id: v.id, color: undefined, cloned: true,
    vi: 'Giọng đã sao chép', en: 'Cloned voice',
  }))

  const resolve = useCallback((name: string) => {
    const u = userVoices.find(v => v.name === name || v.id === name)
    if (u) return { voiceId: u.id }  // cloned: timbre fixed by ref audio
    const p = presetByName[name]
    // Preset = voice-design instruct (stochastic). Pin a per-name seed so the
    // voice is distinct & consistent (fixes dialogue roles sounding random).
    if (p) return { instruct: p.instruct, seed: voiceSeed(name) }
    return {}
  }, [userVoices, presets]) // eslint-disable-line

  return (
    <Ctx.Provider value={{ presets, presetByName, userVoices, userUIVoices, apiOk, apiChecked, refresh, resolve }}>
      {children}
    </Ctx.Provider>
  )
}
