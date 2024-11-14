import { createRequire } from 'module';

const require = createRequire(import.meta.url);

import fs from "node:fs/promises";
import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Remove the experimental.after option
    eslint: {
        ignoreDuringBuilds: true,
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Cross-Origin-Opener-Policy",
                        value: "same-origin",
                    },
                    {
                        key: "Cross-Origin-Embedder-Policy",
                        value: "require-corp",
                    },
                ],
            },
        ];
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                crypto: require.resolve('crypto-browserify'),
            };
        }
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };
        return config;
    },
    //output: 'standalone',
};

export default nextConfig;