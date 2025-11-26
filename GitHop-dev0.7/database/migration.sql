-- Add language_expertise column to developers table
-- Run this migration in your database

ALTER TABLE developers 
ADD COLUMN IF NOT EXISTS language_expertise JSONB DEFAULT '{}';

-- Add index for faster queries on language expertise
CREATE INDEX IF NOT EXISTS idx_devs_language_expertise 
ON developers USING gin (language_expertise);

-- Example of the JSON structure that will be stored:
/*
{
  "expertise": [
    {
      "language": "TypeScript",
      "level": "master",
      "score": 92,
      "repos_count": 45,
      "total_stars": 125000,
      "largest_project": "react",
      "largest_project_stars": 100000,
      "total_commits": 5420,
      "is_primary": true
    },
    {
      "language": "JavaScript",
      "level": "expert",
      "score": 78,
      "repos_count": 32,
      "total_stars": 45000,
      "largest_project": "vue",
      "largest_project_stars": 30000,
      "total_commits": 3200,
      "is_primary": false
    }
  ],
  "favorites": ["TypeScript", "JavaScript", "Python"],
  "polyglot_score": 75
}
*/

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'developers' 
AND column_name = 'language_expertise';