import clsx from 'clsx'
import type { AgentMessage } from '../types'

interface ChatMessageProps {
  message: AgentMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  return (
    <div
      className={clsx('chat-message', {
        'chat-message--user': isUser,
        'chat-message--assistant': !isUser,
      })}
    >
      <div className="chat-message__avatar" aria-hidden>
        {isUser ? '??' : '?'}
      </div>
      <div className="chat-message__bubble">
        <p>{message.content}</p>
      </div>
    </div>
  )
}
