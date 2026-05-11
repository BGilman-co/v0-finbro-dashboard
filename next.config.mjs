/** @type {import('next').NextConfig} */
const repositoryName = "v0-finbro-dashboard"
const isGithubPages = process.env.GITHUB_PAGES === "true"

const nextConfig = {
  basePath: isGithubPages ? `/${repositoryName}` : "",
  assetPrefix: isGithubPages ? `/${repositoryName}/` : "",
  env: {
    NEXT_PUBLIC_BASE_PATH: isGithubPages ? `/${repositoryName}` : "",
  },
  trailingSlash: isGithubPages,
}

export default nextConfig
