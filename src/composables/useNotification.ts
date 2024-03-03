export enum NotificationType {
  Information = "Information",
  Success = "Success",
  Warning = "Warning",
  Danger = "Danger",
}

export type Notification = {
  show: boolean
  text: string
  type: NotificationType
  withLoader: boolean
}

export const useNotification = () => ref({ show: false, text: "", type: NotificationType.Success, withLoader: false })

export const useShowNotification = async (
  notification: globalThis.Ref<Notification>,
  {
    text,
    type,
    delay = 5000,
    withLoader = false
  }: {
    text: string
    type?: NotificationType
    delay?: number
    withLoader?: boolean
  }
) => {
  notification.value = {
    show: true,
    type: type ? type : NotificationType.Success,
    text,
    withLoader
  }

  console.log(JSON.stringify(notification.value))
  await useSleep(delay)
  if (notification.value.show) {
    notification.value.show = false
  }
}

export const useHideNotification = (
  notification: globalThis.Ref<Notification>
) => (notification.value.show = false)
