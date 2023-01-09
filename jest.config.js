module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    setupFilesAfterEnv: ["@relmify/jest-fp-ts"],
    collectCoverageFrom: ["src/**/*", "!src/**/*.spec.*"],
    coverageDirectory: "coverage",
    reporters: [
        "default",
        [
            "jest-junit",
            {
                outputDirectory: "./test-results",
            },
        ],
    ],
};
