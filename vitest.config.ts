import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        reporters: [
            "default",
            ["junit", {outputFile: "./test-results/junit.xml"}],
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
        },
    },
});
