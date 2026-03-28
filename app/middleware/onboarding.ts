export default defineNuxtRouteMiddleware((to, _from) => {
  if (to.path === '/') {
    const hasTokens = getTokens().length > 0
    const hasCompletedOnboarding = localStorage.getItem('yhtua_onboarding_done') === '1'
    if (!hasTokens && !hasCompletedOnboarding) {
      return navigateTo('/token/create')
    }
  }
})
