/** @type {import('next').NextConfig} */
const repositoryName = "v0-finbro-dashboard"
const isGithubPages = process.env.GITHUB_PAGES === "true"

const nextConfig = {
  output: "export",
  basePath: isGithubPages ? `/${repositoryName}` : "",
  assetPrefix: isGithubPages ? `/${repositoryName}/` : "",
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
