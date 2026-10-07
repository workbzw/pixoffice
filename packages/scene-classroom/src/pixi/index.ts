import { Assets, Container, Graphics, Text } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { PropViewRegistry } from '@pixoffice/renderer-pixi'
import type { ScenePresentationPack } from '@pixoffice/renderer-pixi'
import type { PresentedActor } from '@pixoffice/contracts'
import { CLASSROOM_ARTWORK, CLASSROOM_CELL as CELL, CLASSROOM_CHARACTER, classroomCellCenter as center, classroomActorGeometry } from './alignment.ts'
import { createClassroomDeskView } from './deskView.ts'

export function createClassroomPresentation(assetBaseUrl: string): ScenePresentationPack {
  const url = (file: string) => new URL(file, assetBaseUrl).href
  let deskTexture: Texture, chairTexture: Texture
  return {
    id: 'pixoffice.classroom', cellPixels: CELL, resourceCount: 3, cellCenter: center,
    loadBackground: () => Assets.load<Texture>(url('room.webp')),
    async loadObjects(report) {
      const [desk, chair] = await Promise.all([
        Assets.load<Texture>(url(CLASSROOM_ARTWORK.desk.file)).then(texture => { report('classroom.desk'); return texture }),
        Assets.load<Texture>(url(CLASSROOM_ARTWORK.chair.file)).then(texture => { report('classroom.chair'); return texture }),
      ])
      deskTexture = desk; chairTexture = chair
    },
    createPropViews() {
      const registry = new PropViewRegistry(CELL)
      registry.register('classroom.desk', () => createClassroomDeskView(deskTexture, chairTexture))
      registry.register('classroom.blackboard', () => {
        const root = new Container(), frame = new Graphics()
        frame.roundRect(0, 0, 400, 132, 4).fill(0x849188)
          .rect(6, 6, 388, 118).fill(0x294e45)
          .rect(-3, 128, 406, 6).fill(0xc6cbc5)
          .roundRect(348, 124, 22, 4, 1).fill(0xe5e5d9)
        const title = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 23, fontWeight: '600', fill: 0xffffff, wordWrap: true, wordWrapWidth: 354, breakWords: true } })
        const body = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 17, lineHeight: 24, fill: 0xe0eae2, wordWrap: true, wordWrapWidth: 354, breakWords: true } })
        title.position.set(22, 16); body.position.set(22, 52)
        root.addChild(frame, title, body)
        return { roots: [root], hitTarget: root, update(prop) {
          root.position.set(prop.position.x * CELL, prop.position.y * CELL - 157); root.zIndex = prop.position.y * CELL
          title.text = String(prop.state.title ?? ''); body.text = String(prop.state.text ?? '')
          // Keep long protocol-supplied content inside the board, without truncating its state.
          title.scale.set(Math.min(1, 30 / Math.max(1, title.height / title.scale.y)))
          body.scale.set(Math.min(1, 66 / Math.max(1, body.height / body.scale.y)))
        } }
      })
      return registry
    },
    projectActors(runtime, preview): PresentedActor[] {
      const phases = runtime.readActivePhases()
      return (preview?.actors ?? runtime.readActors()).map(actor => {
        const step = actor.step
        const transition = actor.seatTransition, sitting = transition?.stage === 'sitting', rising = transition?.stage === 'rising'
        const seated = actor.posture === 'seated' && !step
        const actionId = sitting ? 'core.sit-down' : rising ? 'core.stand-up' : step ? 'core.walk' : 'core.idle'
        const phase = phases.find(p => p.participants.includes(actor.id))
        const { position, depth } = classroomActorGeometry(actor)
        return {
          id: actor.id, appearanceId: actor.templateId, name: actor.name, position, depth,
          displayHeight: actor.id === 'teacher' ? CLASSROOM_CHARACTER.teacherHeight : CLASSROOM_CHARACTER.height,
          intent: { actionId, poseId: sitting || rising ? 'transition' : seated ? 'seated' : 'standing',
            view: sitting || rising ? 'back' : actor.facing, ...(sitting || rising ? { progress: transition!.progress } : {}),
            speech: !step && !transition ? actor.speech?.text : undefined },
          status: step ? 'walking' : phase ? 'working' : 'idle',
          bubble: actor.speech?.text,
          ...(actor.homeId ? { furniture: { propId: actor.homeId, seated, transitioning: Boolean(transition) } } : {}),
        }
      })
    },
  }
}
