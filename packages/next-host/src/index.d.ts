export declare function isTauriBuild(...args: unknown[]): boolean;
export declare function withBun<T>(
  nextConfig: T | ((phase: string, ctx: unknown) => T | Promise<T>),
  options?: {
    alias?: Record<string, string>;
    dedupe?: string[];
    root?: string | false;
    transpileSources?: boolean;
    freezeBuildConfig?: boolean;
    projectDir?: string;
    reactCompiler?: boolean;
    typedRoutes?: boolean;
    cacheComponents?: boolean;
    tauri?: boolean | "auto" | { devHost?: string; devPort?: number; env?: Record<string, string> };
    bundler?: "turbopack";
  },
): (phase: string, ctx: any) => Promise<import("next").NextConfig>;
