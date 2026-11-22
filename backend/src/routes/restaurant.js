import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { localized } from '../i18n.js';

const router = Router();

// GET /api/restaurant  — AFA info shown on "Visit AFA" and the reservation page
router.get('/restaurant', asyncHandler(async (req, res) => {
  const { rows: [r] } = await query(
    `SELECT rt.slug, rt.name, rt.description, rt.address, rt.city, rt.phone, rt.email, rt.opening_hours, rt.translations,
            (SELECT COUNT(*) FROM dishes d WHERE d.restaurant_id = rt.id AND d.is_available) AS dish_count,
            (SELECT ROUND(AVG(rv.rating)::numeric, 1) FROM reviews rv
               JOIN dishes d ON d.id = rv.dish_id WHERE d.restaurant_id = rt.id) AS avg_rating
       FROM restaurants rt ORDER BY rt.id LIMIT 1`
  );
  if (!r) throw new HttpError(404, 'NO_RESTAURANT');
  res.json({
    restaurant: {
      slug: r.slug,
      name: r.name,
      description: localized(r.translations, req.lang, 'description', r.description),
      address: localized(r.translations, req.lang, 'address', r.address),
      city: localized(r.translations, req.lang, 'city', r.city),
      phone: r.phone,
      email: r.email,
      openingHours: r.opening_hours,
      dishCount: r.dish_count,
      averageRating: r.avg_rating
    }
  });
}));

export default router;
