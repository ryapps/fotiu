UPDATE "packages"
SET "price" = CASE "slug"
  WHEN 'portrait-basic' THEN 20000
  WHEN 'family-session' THEN 40000
  WHEN 'graduation-session' THEN 30000
  ELSE LEAST(GREATEST("price", 20000), 40000)
END;
