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
  refresh: () => Promise<void>
  resolve: (name: string) => { voiceId?: string; instruct?: string }
}

const Ctx = createContext<VoicesCtx>(null as any)
export function useVoices() { return useContext(Ctx) }

export function VoicesProvider({ children }: { children: React.ReactNode }) {
  const [presets, setPresets] = useState<api.Preset[]>([])
  const [userVoices, setUserVoices] = useState<api.VoiceRecord[]>([])
  const [apiOk, setApiOk] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([api.getPresets(), api.listVoices()])
      setPresets(p); setUserVoices(v); setApiOk(true)
    } catch {
      setApiOk(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const presetByName: Record<string, api.Preset> = {}
  presets.forEach(p => { presetByName[p.name] = p })

  const userUIVoices: UIVoice[] = userVoices.map(v => ({
    name: v.name, id: v.id, color: undefined,
    vi: 'Giọng đã sao chép', en: 'Cloned voice',
  }))

  const resolve = useCallback((name: string) => {
    const u = userVoices.find(v => v.name === name || v.id === name)
    if (u) return { voiceId: u.id }
    const p = presetByName[name]
    if (p) return { instruct: p.instruct }
    return {}
  }, [userVoices, presets]) // eslint-disable-line

  return (
    <Ctx.Provider value={{ presets, presetByName, userVoices, userUIVoices, apiOk, refresh, resolve }}>
      {children}
    </Ctx.Provider>
  )
}
