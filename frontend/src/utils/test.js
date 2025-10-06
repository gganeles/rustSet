export function navigate(to) {
    // push a new history entry and trigger a popstate so any listener
    // (like the one in App.jsx) will recompute the route.
    window.history.pushState({}, '', to)
    // Create and dispatch a popstate event to notify listeners
    try {
        window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (e) {
        // fallback for older browsers
        const evt = document.createEvent('Event')
        window.dispatchEvent(evt)
    }
}