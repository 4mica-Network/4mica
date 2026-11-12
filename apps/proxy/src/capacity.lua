-- KEYS[i] pairs with ARGV[3i .. 3i+2] = kind, a, b. ARGV[1] = now_ms, ARGV[2] = lease id.
-- Returns 0 when every check passed and was applied, otherwise the 1-based index of the first failure.
local now = tonumber(ARGV[1])
local lease = ARGV[2]

local function arg(i)
  return ARGV[3 * i], tonumber(ARGV[3 * i + 1]), tonumber(ARGV[3 * i + 2])
end

for i, key in ipairs(KEYS) do
  local kind, a, b = arg(i)
  if kind == 'cooldown' then
    if redis.call('EXISTS', key) == 1 then return i end
  elseif kind == 'rate' then
    if tonumber(redis.call('GET', key) or '0') + 1 > a then return i end
  elseif kind == 'quota' then
    if tonumber(redis.call('GET', key) or '0') + b > a then return i end
  elseif kind == 'concurrency' then
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
    if redis.call('ZCARD', key) >= a then return i end
  end
end

for i, key in ipairs(KEYS) do
  local kind, a, b = arg(i)
  if kind == 'rate' then
    if redis.call('INCR', key) == 1 then redis.call('PEXPIRE', key, b) end
  elseif kind == 'quota' then
    redis.call('INCRBY', key, b)
    redis.call('PEXPIRE', key, 40 * 24 * 3600 * 1000)
  elseif kind == 'concurrency' then
    redis.call('ZADD', key, now + b, lease)
  end
end

return 0
