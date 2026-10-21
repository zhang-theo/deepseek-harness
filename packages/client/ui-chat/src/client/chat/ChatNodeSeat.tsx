import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConversationLocationDataStore, ConversationTurnDataMap } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, UsePresentation } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import type { ChatNodeStore } from '../contract/snapshot.ts'
import { isAtOrOutside } from '../contract/group-tree.ts'
import { turnProcessAlwaysOpen } from '../contract/turn-process.ts'
import { turnProcessOpen } from '../stores.ts'
import { hiddenOrCollapsing } from './flow-motion.ts'
import css from './ChatView.module.css'

interface ChatNodeSeatProps extends ChatNodeOwnerProps {
  readonly nodeKey: string
  /** A replaced Builder must rebind keyed hooks even when references and keys survive. */
  readonly nodeStore: ChatNodeStore
  readonly useChatNode: ChatFlowSlotProps['useChatNode']
  readonly useChatNodeProcess: ChatFlowSlotProps['useChatNodeProcess']
  readonly usePresentation: UsePresentation
  readonly useStore: ChatFlowSlotProps['useStore']
  readonly actions: ChatFlowSlotProps['actions']
  readonly renderSlot: ChatFlowSlotProps['renderSlot']
  readonly t: ChatFlowSlotProps['t']
  readonly useChatNodeBottom: ChatFlowSlotProps['useChatNodeBottom']
  readonly deferCollapse: boolean
  readonly useGroupAction: ChatFlowSlotProps['useGroupAction']
}

type RoutedChatNodeOwner = {
  [Kind in ChatNode['kind']]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> }
}[ChatNode['kind']]

function turnDataOf(node: ChatNode | undefined): ConversationLocationDataStore<ConversationTurnDataMap> | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.data : undefined
}

function turnOf(node: ChatNode | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
}

function isUserStyleChatNode(node: ChatNode): node is ChatNode<'user' | 'steering'> {
  return node.kind === 'user' || node.kind === 'steering'
}

/** Admitted steering reuses the user keyed occupant; the seat wrapper keeps kind steering. */
function chatNodeRendererKey(node: ChatNode): ChatNode['kind'] {
  return isUserStyleChatNode(node) ? 'user' : node.kind
}

/** User and steering rows stay ordinary bubbles when the keyed renderer is absent. */
function chatNodeFallback(
  owner: RoutedChatNodeOwner,
  t: ChatViewSlotProps['t'],
): ReactNode {
  if (isUserStyleChatNode(owner.node)) {
    return (
      <UserMessageFallbackView
        node={owner.node}
        renderMessageImages={owner.renderMessageImages}
        openFile={owner.openFile}
        openSkill={owner.openSkill}
        t={t}
      />
    )
  }
  return (
    <JsonBlock
      label={t('message.unknownSurface', { type: owner.node.kind })}
      payload={owner.node.data}
      truncatedLabel={total => t('json.truncated', { total })}
    />
  )
}

/** Subscribe, apply Turn-process visibility, and dispatch one stable Context key. */
export const ChatNodeSeat = memo(function ChatNodeSeat({
  nodeKey, groupPart, useChatNode, useChatNodeProcess, usePresentation,
  cwd, openFile, inspectCall, forkAt,
  loadImage, fileMentions, useStore, actions, renderSlot, t, useChatNodeBottom, deferCollapse, useGroupAction,
}: ChatNodeSeatProps) {
  const bottom = useChatNodeBottom(nodeKey)
  const node = useChatNode(nodeKey)
  const routedNode = node as ChatNode | undefined
  const turn = turnOf(routedNode)
  const processPresentation = useChatNodeProcess(nodeKey)
  const processSpec = processPresentation?.spec
  const storedOpen = useStore(state => processSpec !== undefined
    && turnProcessOpen(state, processSpec, bottom === true && deferCollapse))
  const liveProcess = processPresentation !== undefined && !processPresentation.turnClosed
  const interleavedInput = processPresentation?.hasInterleavedInput === true
  const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(routedNode)
  const processOpen = alwaysOpen || storedOpen
  const setOpen = useCallback((open: boolean) => {
    if (processSpec !== undefined && processSpec.answerStep !== null) {
      actions.setTurnProcessOpen(processSpec.turn, processSpec.answerStep, open)
    }
  }, [actions, processSpec])
  const processWindowReady = processSpec !== undefined
    && processPresentation !== undefined
    && compactTranscript
    && processSpec.answerAnchorSeq !== null
    && processPresentation.turn === processSpec.turn
    && processPresentation.turnClosed
    && !historyIncomplete
  const processMember = routedNode !== undefined
    && processWindowReady
    && !isAtOrOutside(routedNode, 'turn')
    && routedNode.anchorSeq >= processSpec.processStartSeq
    && routedNode.anchorSeq < processSpec.answerAnchorSeq
  const processAnswer = routedNode !== undefined
    && processWindowReady
    && routedNode.kind === 'assistant-step'
    && routedNode.data.step === processSpec.answerStep
  const ownsDisclosure = routedNode?.kind === 'turn-process' || processAnswer
  const foldable = processWindowReady
    && (processMember || (ownsDisclosure
      && (processPresentation.hasExternalProcess || processSpec.inlineReasoning)))
  const turnProcess = useMemo(() => processSpec === undefined
    ? undefined
    : {
      spec: processSpec,
      foldable,
      hasContent: processPresentation?.hasExternalProcess === true || processSpec.inlineReasoning,
      open: processOpen,
      setOpen,
    }, [
    foldable, processOpen, processSpec, processPresentation?.hasExternalProcess, setOpen,
  ])
  const controllerInactive = routedNode?.kind === 'turn-process'
    && !foldable
  const compactAnswer = processAnswer
    && foldable
    && processPresentation.compactAnswer
    && !processOpen
  const processHidden = controllerInactive || (foldable && processMember && !processOpen)
  const revealProcess = useCallback(() => {
    if (processMember) setOpen(true)
  }, [processMember, setOpen])
  const wrapperRef = useGroupAction(processHidden, revealProcess)
  const [disclosureReset] = useState(() => createSnapshotStore(0))
  const turnData = turnDataOf(routedNode)
  const hookContext = useMemo<ChatNodeHookContext>(
    () => ({ turnData, disclosureReset, useGroupAction }), [turnData, disclosureReset, useGroupAction],
  )
  useEffect(() => {
    if (processMember && processHidden && wrapperRef.current !== null && hiddenOrCollapsing(wrapperRef.current)) {
      disclosureReset.set(disclosureReset.getSnapshot() + 1)
    }
  }, [processMember, processHidden, wrapperRef, disclosureReset])
  const owner = useMemo<ChatNodeOwnerProps | null>(() => node === undefined
    ? null
    : {
      ...groupPart === undefined ? {} : { groupPart },
      cwd,
      openFile,
      inspectCall,
      forkAt,
      loadImage,
      fileMentions,
      turnProcess,
    }, [
    node, groupPart, cwd, openFile, inspectCall, forkAt,
    loadImage, fileMentions, turnProcess,
  ])
  if (routedNode === undefined || owner === null) return null
  // User-style nodes share the user keyed occupant; other kinds keep their
  // discriminant. TypeScript does not distribute an object containing a union
  // into a union of objects itself.
  const routedOwner = { ...owner, node: routedNode } as RoutedChatNodeOwner
  return (
    <div
      ref={wrapperRef}
      className={css.flowItem}
      data-chat-anchor-key={routedNode.key}
      data-chat-flow-key={routedNode.key}
      data-chat-flow-kind={routedNode.kind}
      data-chat-turn={turn}
      data-turn-process-member={processMember || undefined}
      data-turn-process-hidden={processHidden || undefined}
      data-turn-process-answer={compactAnswer || undefined}
    >
      {renderSlot('conversation.chat.node', routedOwner, {
        entryKey: chatNodeRendererKey(routedNode),
        hookContext,
        fallback: chatNodeFallback(routedOwner, t),
      })}
    </div>
  )
})
