import { createSignal, onMount } from 'solid-js'

export default function NameModal(props) {
    const [value, setValue] = createSignal('')
    const [error, setError] = createSignal('')

    onMount(() => {
        // prefill from props.prefill if provided
        if (props.prefill) setValue(props.prefill)
    })

    function submit(e) {
        e && e.preventDefault()
        const v = value().trim()
        if (!v) {
            setError('Please enter a name')
            return
        }
        setError('')
        if (props.onSave) props.onSave(v)
    }

    return (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-white p-5 rounded shadow max-w-lg w-[90%]">
                <h3 class="text-lg font-medium mb-2">Welcome — what's your name?</h3>
                <form onSubmit={submit}>
                    <input class="w-full box-border p-2 border rounded" placeholder="Your name" value={value()} onInput={(e) => setValue(e.target.value)} />
                    {error() && <div class="text-red-600 mt-2">{error()}</div>}
                    <div class="flex justify-end gap-2 mt-3">
                        <button type="submit" class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                    </div>
                </form>
            </div>
        </div>
    )
}
