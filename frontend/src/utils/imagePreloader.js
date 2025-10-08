// Preload all Set card images to cache them
export function preloadCardImages() {
    const shapes = ['oval', 'squiggle', 'diamond']
    const fillings = ['filled', 'lines', 'clear']
    const colors = ['red', 'green', 'purple']
    const numbers = ['1', '2', '3']

    const baseUrl = 'https://set.gganeles.com/RegCards'
    const images = []

    // Generate all possible card combinations (3^4 = 81 cards)
    for (const shape of shapes) {
        for (const filling of fillings) {
            for (const color of colors) {
                for (const number of numbers) {
                    const url = `${baseUrl}/${shape}_${filling}_${color}_${number}.png`

                    // Create image element to trigger browser cache
                    const img = new Image()
                    img.src = url
                    images.push(img)

                    // Optional: log progress
                    // console.log(`Preloading: ${url}`)
                }
            }
        }
    }

    console.log(`Preloading ${images.length} card images...`)

    // Return a promise that resolves when all images are loaded
    return Promise.allSettled(
        images.map(img =>
            new Promise((resolve, reject) => {
                img.onload = () => resolve(img.src)
                img.onerror = () => reject(img.src)
            })
        )
    ).then(results => {
        const loaded = results.filter(r => r.status === 'fulfilled').length
        const failed = results.filter(r => r.status === 'rejected').length
        console.log(`Card images preloaded: ${loaded} succeeded, ${failed} failed`)
        return { loaded, failed, total: images.length }
    })
}
