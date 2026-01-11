import { Hono } from 'hono';
import { Bindings } from './type';

import account from './routes/account';
import totp from './routes/totp';
import images from './routes/images';
import posts from './routes/posts';
import likes from './routes/likes';

// Create main router
const app = new Hono<{ Bindings: Bindings }>();

// Account APIs route
app.route('/v1', account);
// TOTP APIs route
app.route('/v1/totp', totp);
// Images APIs route
app.route('/v1/images', images);
// Posts APIs route
app.route('/v1/posts', posts);
// Likes APIs route
app.route('/v1/likes', likes);

// Global error handler
app.onError((err, c) => {
    console.error(err);
    return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

// Export main router
export default app;