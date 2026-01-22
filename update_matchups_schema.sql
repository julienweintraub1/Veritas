-- Add status and confirmation tracking to matchups
ALTER TABLE matchups 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending', -- 'pending', 'active', 'completed'
ADD COLUMN IF NOT EXISTS user1_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS user2_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS user1_settings jsonb DEFAULT '{}'::jsonb, -- Individual preference
ADD COLUMN IF NOT EXISTS user2_settings jsonb DEFAULT '{}'::jsonb; -- Individual preference

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);
CREATE INDEX IF NOT EXISTS idx_matchups_users ON matchups(user1_id, user2_id);
