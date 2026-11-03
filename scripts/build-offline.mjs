import {build} from 'vite';
import react from '@vitejs/plugin-react';
await build({configFile:false,publicDir:false,plugins:[react()],define:{'process.env.NODE_ENV':JSON.stringify('production'),__BUILD__:JSON.stringify('offline')},build:{outDir:'public/offline-player',emptyOutDir:true,lib:{entry:'src/offline/player.tsx',name:'ELTOffline',formats:['iife'],fileName:()=> 'player.js'},rollupOptions:{output:{inlineDynamicImports:true}},chunkSizeWarningLimit:10000}});
