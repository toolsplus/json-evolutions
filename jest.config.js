module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
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
