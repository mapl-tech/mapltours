import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/checkout', '/profile', '/auth/'],
      },
    ],
    sitemap: 'https://mapltours.com/sitemap.xml',
  }
}
