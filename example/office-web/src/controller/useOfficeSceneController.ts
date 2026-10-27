import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { OfficeScene, type OfficeAgentClick, type SceneLoadProgress, type SceneActionProgress } from '../application/OfficeScene.ts'
import type { Agent } from '@pixoffice/scene-office/types'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import type { MapFurniture } from '../components/map-editor/commands.ts'
import { SceneHost } from '../../../shared/scene/SceneHost.ts'
import type { OfficeSimulation } from '../application/OfficeSimulation.ts'
import type { OfficeDemoMode } from '../application/OfficeSimulation.ts'
import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { officeActorTasks } from '../dashboard/actorTasks.ts'
import { WhiteboardProgress } from '@pixoffice/scene-office/whiteboard'
import { ActorInsightInteraction } from '../application/ActorInsightInteraction.ts'

type AgentMenuState = {
  agent: Agent
  rosterNo: number
  x: number
  y: number
  agents: Agent[]
  pickingTarget: boolean
}

export function useOfficeSceneController(runtime: SceneRuntime, covered = false, simulation?: OfficeSimulation, dashboard: DashboardSnapshot | null = null, onInspect?: (actorId: string) => void, suppliedWhiteboardProgress?: WhiteboardProgress, onInspectEmployee?: (employeeId: string) => void, onSelectActor?: (actorId: string) => boolean, actorInsightsEnabled = true) {
  useSyncExternalStore(runtime.subscribe, runtime.getRevision)
  const [host] = useState(() => new SceneHost())
  const [insightInteraction] = useState(() => new ActorInsightInteraction())
  const insight = useSyncExternalStore(insightInteraction.subscribe, insightInteraction.getSnapshot)
  const whiteboardProgress = useMemo(() => { void runtime; return suppliedWhiteboardProgress ?? new WhiteboardProgress() }, [runtime, suppliedWhiteboardProgress])
  const sceneRef = useRef<OfficeScene | null>(null)
  const selectionHandler = useRef(onSelectActor)
  const insightsEnabledRef = useRef(actorInsightsEnabled)
  useEffect(() => { selectionHandler.current = onSelectActor }, [onSelectActor])
  useEffect(() => {
    insightsEnabledRef.current = actorInsightsEnabled
    if (!actorInsightsEnabled) insightInteraction.close()
  }, [actorInsightsEnabled, insightInteraction])
  const tasks = useMemo(() => officeActorTasks(dashboard), [dashboard])
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  const readyRef = useRef(false)
  const [menu, setMenu] = useState<AgentMenuState | null>(null)
  const [whiteboardId, setWhiteboardId] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [demoMode, setDemoMode] = useState<OfficeDemoMode>(simulation?.demoMode ?? 'scenario')
  const [demoStatus, setDemoStatus] = useState('')
  const [demoScenarioLabel, setDemoScenarioLabel] = useState(simulation?.scenarioLabel ?? '工位协作')
  const [notice, setNotice] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<SceneLoadProgress>({ completed: 0, total: 0 })
  const [actions, setActions] = useState<SceneActionProgress>({ completed: 0, total: 0, ready: false })
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const previewProp = useCallback((value?: MapFurniture) => sceneRef.current?.previewProp(value), [])
  const highlightProp = useCallback((id: string, valid: boolean) => sceneRef.current?.highlightProp(id, valid), [])
  const showAgentActions = useCallback((actorId: string, employeeId = '') => {
    const agents = sceneRef.current?.getAgents() ?? [], index = agents.findIndex(agent => agent.id === actorId)
    if (index < 0) return
    const anchor = sceneRef.current?.actorClientAnchor(actorId), rect = host.element.getBoundingClientRect()
    insightInteraction.close()
    if (employeeId && onInspectEmployee) { onInspectEmployee(employeeId); return }
    if (onInspect) { onInspect(actorId); return }
    setMenu({ agent: agents[index], rosterNo: index + 1, agents, pickingTarget: false,
      x: Math.max(12, Math.min((anchor?.clientX ?? rect.left) - rect.left, rect.width - 272)),
      y: Math.max(12, Math.min((anchor?.clientY ?? rect.top) - rect.top, rect.height - Math.min(520, rect.height - 24) - 12)) })
  }, [host, insightInteraction, onInspect, onInspectEmployee])

  const editing = runtime.isEditing
  useEffect(() => { insightInteraction.close() }, [insightInteraction, runtime, dashboard?.conversationId, covered, editing, whiteboardId])
  useEffect(() => () => insightInteraction.dispose(), [insightInteraction])

  useEffect(() => {
    const element = host.element
    setMenu(null); setWhiteboardId(null); setNotice(simulation?.error ?? null); setDemo(simulation?.isDemoRunning ?? false)
    setDemoMode(simulation?.demoMode ?? 'scenario'); setDemoStatus(simulation?.demoStatus ?? '')
    setDemoScenarioLabel(simulation?.scenarioLabel ?? '工位协作')

    const handleAgentClick = (event: OfficeAgentClick) => {
      if (selectionHandler.current?.(event.agent.id)) { setMenu(null); insightInteraction.close(); return }
      if (onInspect) { setMenu(null); insightInteraction.close(); onInspect(event.agent.id); return }
      setMenu(null)
      if (!insightsEnabledRef.current) return
      insightInteraction.open({ actorId: event.agent.id, ...(sceneRef.current?.actorClientAnchor(event.agent.id) ?? event) })
    }

    let active = true
    const scene = new OfficeScene({ runtime, simulation, onAgentClick: handleAgentClick, onDraftChange: setNotice,
      onDemoChange: (running, mode, status) => { setDemo(running); setDemoMode(mode); setDemoStatus(status) },
      onActorHover: event => {
        if (!insightsEnabledRef.current) return
        if (event.hovered) insightInteraction.enter({ ...event, ...(sceneRef.current?.actorClientAnchor(event.actorId) ?? event) })
        else insightInteraction.leave(event.actorId)
      },
      taskForActor: id => tasksRef.current.get(id), whiteboardProgress,
      onPropClick: event => {
        if (runtime.readWorld().props.some(prop => prop.id === event.propId && prop.templateId === 'office.wall-whiteboard')) setWhiteboardId(event.propId)
      },
      onLoadProgress: value => { if (active) setProgress(value) },
      onActionProgress: value => { if (active) setActions(value) } })
    sceneRef.current = scene

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width <= 0 || height <= 0) return

      if (!readyRef.current) {
        readyRef.current = true
        setLoaded(false)
        setProgress({ completed: 0, total: 0 })
        setActions({ completed: 0, total: 0, ready: false })
        void scene.init(element, width, height).then(async () => {
          if (!active) return
          setLoaded(true); setDemo(scene.isDemoRunning)
          setDemoMode(scene.demoMode); setDemoStatus(scene.demoStatus); setDemoScenarioLabel(scene.demoScenarioLabel)
          const previews: Record<string, string> = {}
          for (const template of runtime.templates()) {
            if (!active) return
            previews[template.id] = await scene.furnitureThumbnail(template.id)
          }
          if (active) setThumbnails(previews)
        }).catch((error) => {
          console.error('[Office] 场景初始化失败', error)
          if (active) setNotice(String(error))
        })
        return
      }

      sceneRef.current?.resize(width, height)
    })

    ro.observe(element)

    return () => {
      active = false
      ro.disconnect()
      readyRef.current = false
      scene.destroy()
      sceneRef.current = null
    }
  }, [runtime, host, simulation, insightInteraction, whiteboardProgress, onInspect])

  useEffect(() => {
    sceneRef.current?.setRenderingSuspended(covered || whiteboardId !== null)
  }, [covered, whiteboardId, loaded, runtime])

  const whiteboard = whiteboardId ? runtime.readWorld().props.find(prop => prop.id === whiteboardId) : undefined
  return { host, sceneRef, menu, setMenu, whiteboard, whiteboardProgress, closeWhiteboard: () => setWhiteboardId(null), demo, setDemo, demoMode, setDemoMode, demoStatus, demoScenarioLabel, canDemo: simulation?.canDemo ?? true, notice, setNotice,
    loaded, progress, actions, thumbnails, previewProp, highlightProp, insight, insightInteraction, showAgentActions, actorInsightsEnabled }
}
export type OfficeSceneController = ReturnType<typeof useOfficeSceneController>
