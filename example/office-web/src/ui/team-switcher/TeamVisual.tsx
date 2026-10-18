import { ArrowUpRight, Check, UsersRound } from 'lucide-react'
import { CharacterAvatar } from '../../components/CharacterArtwork.tsx'
import type { OfficeTeamOption } from './model.ts'

export function TeamThumbnail({ team }: { team: OfficeTeamOption }) {
  return <span className="team-thumbnail">
    <img src={team.previewUrl ?? `${import.meta.env.BASE_URL}site/office-scene.webp`} alt="" draggable={false} decoding="async" />
    <span className="team-room-label">{team.sceneLabel}</span>
  </span>
}

export function TeamAvatars({ team }: { team: OfficeTeamOption }) {
  return <span className="team-avatars" aria-hidden="true">
    {(team.avatarIds ?? []).slice(0, 4).map((id, index) => <CharacterAvatar appearanceId={id} key={`${id}:${index}`} />)}
    {!team.avatarIds?.length && <UsersRound size={22} strokeWidth={1.5} />}
  </span>
}

export function TeamStats({ team }: { team: OfficeTeamOption }) {
  const values = [
    team.memberCount != null ? `${team.memberCount} 位成员` : undefined,
    team.workingCount != null ? `${team.workingCount} 人工作中` : undefined,
    team.pendingCount != null ? `${team.pendingCount} 项待处理` : undefined,
  ].filter(Boolean)
  return values.length || team.decisionCount ? <span className="team-stats">{values.map(value => <span key={value}>{value}</span>)}
    {!!team.decisionCount && <span className="team-decision-stat">{team.decisionCount} 项待确认</span>}
  </span> : null
}

export function TeamEnter({ current }: { current: boolean }) {
  return <span className={`team-enter${current ? ' is-current' : ''}`}>{current ? <><Check size={15} />当前空间</> : <>进入团队<ArrowUpRight size={16} /></>}</span>
}
