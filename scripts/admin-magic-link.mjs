import { createClient } from '@supabase/supabase-js'

const email = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://localhost:3000'

if (!email) {
  console.error(
    'Usage: node --env-file=.env.local scripts/admin-magic-link.mjs <email> [baseUrl]'
  )
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${baseUrl}/auth/callback` },
})

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

const { hashed_token, email_otp } = data.properties
const directUrl = `${baseUrl}/auth/callback?token_hash=${hashed_token}&type=magiclink&next=/app`

console.log('\n--- Direct sign-in URL (paste into browser) ---\n')
console.log(directUrl)
console.log('\n--- Backup: 6-digit OTP code ---')
console.log(email_otp)
console.log()
