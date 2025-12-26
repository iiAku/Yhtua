type Modal = {
  type: string
  title: string
  text: string
  validateTextButton: string
  cancelTextButton: string
  open?: boolean
}

export const useModal = () => {
  const emptyState = {
    id: '',
    type: '',
    title: '',
    text: '',
    validateTextButton: '',
    cancelTextButton: '',
    open: false,
  }
  return ref({
    Warning: { ...emptyState },
    Info: { ...emptyState },
    Success: { ...emptyState },
    Danger: { ...emptyState },
  })
}

export const useShowModal = (
  modal: Modal,
  { type, title, text, validateTextButton, cancelTextButton }: Omit<Modal, 'open'>,
) => {
  modal.cancelTextButton = cancelTextButton
  modal.title = title
  modal.text = text
  modal.validateTextButton = validateTextButton
  modal.type = type
  modal.open = true
}
