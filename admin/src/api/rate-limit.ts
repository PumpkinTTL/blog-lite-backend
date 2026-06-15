import request from './request'

export interface RateRule {
  routeKey: string
  label: string
  limit: number
  ttl: number
}

export interface RateLimitConfig {
  default: { limit: number; ttl: number }
  rules: RateRule[]
}

export function getRateLimitConfig() {
  return request.get('/rate-limit/config')
}

export function updateRateLimitConfig(data: {
  defaultLimit: number
  defaultTtl: number
  rules: RateRule[]
}) {
  return request.put('/rate-limit/config', data)
}
