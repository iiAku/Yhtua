export default defineNuxtRouteMiddleware((to, from) => {
    if (to.path.startsWith('/')) {
        const state = store.getState().tokens
        if (state.length === 0) {
            return navigateTo('/token/create')
        }
    }
})
