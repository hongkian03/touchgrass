import { defineRailway, project, service, volume } from "railway/iac";

// Match these names to the service/volume in the linked Railway environment
// before applying. For a new service, name it "backend" in Railway.
const deployment = {
  serviceName: "backend",
  volumeName: "backend-data",
  region: "us-west2",
  volumeSizeMB: 1024,
} as const;

// Scope ownership to this backend; other services in the project are independent.
export const partial = "touchgrass-backend";

export default defineRailway((ctx) => {
  const data = volume(deployment.volumeName, {
    region: deployment.region,
    sizeMB: deployment.volumeSizeMB,
  });

  const backend = service(deployment.serviceName, {
    // Keep the GitHub source/branch selected in Railway. No credentials or
    // environment variables are declared in this infrastructure file.
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start:
      "sh -c 'exec python start.py --host 0.0.0.0 --port \"${PORT:-8000}\" --no-sweep'",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [deployment.region]: 1 },
    deploy: {
      sleepApplication: false,
      requiredMountPath: "/data",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
    },
    volumeMounts: { "/data": data },
  });

  return project(ctx.projectName ?? "touchgrass", {
    resources: [backend, data],
  });
});
