import { useCallback } from 'preact/hooks'

const api = () => (window as any).cipherMux

interface FolderPickerInputProps {
  value: string
  onChange: (path: string) => void
  placeholder?: string
  defaultPath?: string
  /** Extra CSS class on the wrapper */
  class?: string
  /** CSS class for the <input> element */
  inputClass?: string
  /** CSS class for the browse <button> */
  buttonClass?: string
  autofocus?: boolean
  onKeyDown?: (e: KeyboardEvent) => void
}

export function FolderPickerInput({
  value,
  onChange,
  placeholder,
  defaultPath,
  class: wrapperClass,
  inputClass = 'project-popup__input',
  buttonClass = 'cell-btn',
  autofocus,
  onKeyDown,
}: FolderPickerInputProps) {
  const handleBrowse = useCallback(async () => {
    const result = await api().dialog.openDir({
      title: 'Select folder',
      defaultPath,
    })
    if (result) onChange(result)
  }, [defaultPath, onChange])

  return (
    <div class={`folder-picker ${wrapperClass ?? ''}`}>
      <input
        type="text"
        class={inputClass}
        placeholder={placeholder}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
        autofocus={autofocus}
      />
      <button class={buttonClass} onClick={handleBrowse} title="Browse…">
        {'\u2026'}
      </button>
    </div>
  )
}
