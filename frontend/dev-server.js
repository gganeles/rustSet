#!/usr/bin/env node

// Simple error handlers to prevent ECONNRESET crashes
process.on('uncaughtException', (err) => {
    if (err.code === 'ECONNRESET') {
        // Silently ignore connection reset errors (normal for client disconnects)
        return
    }
    console.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (err) => {
    if (err?.code === 'ECONNRESET') {
        return
    }
    console.error('Unhandled rejection:', err)
})

// Run vite with the provided arguments
import { spawn } from 'child_process'

const args = process.argv.slice(2) // Get all arguments after 'node dev-server.js'
const vite = spawn('npx', ['vite', ...args], {
    stdio: 'inherit',
    shell: true
})

vite.on('close', (code) => {
    process.exit(code)
})
