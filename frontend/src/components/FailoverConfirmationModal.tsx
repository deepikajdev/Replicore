import React, { useEffect } from 'react'
import { AlertTriangle, X, ShieldAlert } from 'lucide-react'

export interface ConfirmationConfig {
  title: string
  description: string
  impactWarning?: string
  targetNodeId: string
  actionLabel: string
  isDestructive?: boolean
  onConfirm: () => void | Promise<void>
}

interface FailoverConfirmationModalProps {
  config: ConfirmationConfig | null
  onClose: () => void
  isSubmitting?: boolean
}

export const FailoverConfirmationModal: React.FC<FailoverConfirmationModalProps> = ({
  config,
  onClose,
  isSubmitting = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isSubmitting])

  if (!config) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md rounded-lg border border-[#30363d] bg-[#161b22] p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-md ${
                config.isDestructive
                  ? 'bg-rose-950/60 border border-rose-800/60 text-rose-400'
                  : 'bg-amber-950/60 border border-amber-800/60 text-amber-400'
              }`}
            >
              {config.isDestructive ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="confirmation-modal-title" className="text-sm font-semibold text-[#e6edf3]">
                {config.title}
              </h3>
              <p className="text-xs text-[#7d8590]">Target Node: <span className="font-mono text-[#e6edf3] font-semibold">{config.targetNodeId}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-[#7d8590] hover:text-[#e6edf3] p-1 rounded hover:bg-[#21262d] transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description & Impact Warning */}
        <div className="text-xs text-[#c9d1d9] space-y-2">
          <p>{config.description}</p>
          {config.impactWarning && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-[11px] leading-relaxed">
              <strong>Impact Warning:</strong> {config.impactWarning}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#21262d]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="py-1.5 px-3 rounded bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] text-xs font-medium border border-[#30363d] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void config.onConfirm()
            }}
            disabled={isSubmitting}
            className={`py-1.5 px-3.5 rounded text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
              config.isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isSubmitting ? 'Executing...' : config.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
