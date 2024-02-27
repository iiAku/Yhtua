export default defineNuxtRouteMiddleware((to, from) => {
    console.log(to.path)
    if (to.path.startsWith('/')) {
        const state = store.getState().tokens
        if (state.length === 0) {
            return navigateTo('/token/create')
        }
    }
})
