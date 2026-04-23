import type { BlogPost } from './blog'
import { POSTS_1 } from './blog-auto-1'
import { POSTS_2 } from './blog-auto-2'
import { POSTS_3 } from './blog-auto-3'
import { POSTS_4 } from './blog-auto-4'
import { POSTS_5 } from './blog-auto-5'

export const AUTO_POSTS: BlogPost[] = [
  ...POSTS_1,
  ...POSTS_2,
  ...POSTS_3,
  ...POSTS_4,
  ...POSTS_5,
]
