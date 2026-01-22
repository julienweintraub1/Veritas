-- Clear stale live stats
UPDATE nfl_players 
SET current_week_stats = '{}'::jsonb;
