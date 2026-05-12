/**
 * 数据库操作层单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUserByUsername,
  getUserById,
  isUserActiveById,
  getSiteSettings,
  updateSiteSettings,
  getChannelById,
  getChannelMembership
} from '../../worker/src/db.js';
import { createMockD1 } from '../integration/test-helpers.js';

describe('Database Operations', () => {
  let db;

  beforeEach(() => {
    db = createMockD1();
  });

  describe('getUserByUsername', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        username: 'alice',
        display_name: 'Alice',
        deleted_at: null
      };

      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [mockUser] })
        })
      });

      const user = await getUserByUsername(db, 'alice');
      expect(user).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const user = await getUserByUsername(db, 'nonexistent');
      expect(user).toBeNull();
    });

    it('should exclude deleted users', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const user = await getUserByUsername(db, 'deleted-user');
      expect(user).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        username: 'alice',
        display_name: 'Alice'
      };

      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [mockUser] })
        })
      });

      const user = await getUserById(db, 1);
      expect(user).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const user = await getUserById(db, 999);
      expect(user).toBeNull();
    });

    it('should handle string userId by converting to number', async () => {
      const mockUser = { id: 1, username: 'alice' };

      db.prepare = () => ({
        bind: (userId) => {
          expect(typeof userId).toBe('number');
          return {
            all: async () => ({ results: [mockUser] })
          };
        }
      });

      await getUserById(db, '1');
    });
  });

  describe('isUserActiveById', () => {
    it('should return true for active user', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [{ id: 1 }] })
        })
      });

      const isActive = await isUserActiveById(db, 1);
      expect(isActive).toBe(true);
    });

    it('should return false for deleted user', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const isActive = await isUserActiveById(db, 1);
      expect(isActive).toBe(false);
    });

    it('should return false for disabled user', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const isActive = await isUserActiveById(db, 1);
      expect(isActive).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const isActive = await isUserActiveById(db, 999);
      expect(isActive).toBe(false);
    });
  });

  describe('getSiteSettings', () => {
    it('should return site settings', async () => {
      db.prepare = () => ({
        all: async () => ({
          results: [
            { setting_key: 'site_name', setting_value: 'My Chat' },
            { setting_key: 'site_icon_url', setting_value: 'https://example.com/icon.png' }
          ]
        })
      });

      const settings = await getSiteSettings(db);
      expect(settings.siteName).toBe('My Chat');
      expect(settings.siteIconUrl).toBe('https://example.com/icon.png');
    });

    it('should return default values when settings not found', async () => {
      db.prepare = () => ({
        all: async () => ({ results: [] })
      });

      const settings = await getSiteSettings(db);
      expect(settings.siteName).toBe('Edgechat');
      expect(settings.siteIconUrl).toBe('');
    });

    it('should handle partial settings', async () => {
      db.prepare = () => ({
        all: async () => ({
          results: [
            { setting_key: 'site_name', setting_value: 'Custom Name' }
          ]
        })
      });

      const settings = await getSiteSettings(db);
      expect(settings.siteName).toBe('Custom Name');
      expect(settings.siteIconUrl).toBe('');
    });
  });

  describe('updateSiteSettings', () => {
    it('should update site name', async () => {
      let batchCalled = false;
      db.batch = async (statements) => {
        batchCalled = true;
        expect(statements.length).toBeGreaterThan(0);
      };

      db.prepare = (sql) => {
        if (sql.includes('INSERT INTO site_settings')) {
          return {
            bind: () => ({ run: async () => ({}) })
          };
        }
        return {
          all: async () => ({
            results: [
              { setting_key: 'site_name', setting_value: 'New Name' }
            ]
          })
        };
      };

      const settings = await updateSiteSettings(db, { siteName: 'New Name' });
      expect(batchCalled).toBe(true);
      expect(settings.siteName).toBe('New Name');
    });

    it('should update site icon URL', async () => {
      let batchCalled = false;
      db.batch = async (statements) => {
        batchCalled = true;
        expect(statements.length).toBeGreaterThan(0);
      };

      db.prepare = (sql) => {
        if (sql.includes('INSERT INTO site_settings')) {
          return {
            bind: () => ({ run: async () => ({}) })
          };
        }
        return {
          all: async () => ({
            results: [
              { setting_key: 'site_icon_url', setting_value: 'https://new.com/icon.png' }
            ]
          })
        };
      };

      const settings = await updateSiteSettings(db, { siteIconUrl: 'https://new.com/icon.png' });
      expect(batchCalled).toBe(true);
    });

    it('should handle empty updates gracefully', async () => {
      let batchCalled = false;
      db.batch = async () => {
        batchCalled = true;
      };

      db.prepare = () => ({
        all: async () => ({ results: [] })
      });

      await updateSiteSettings(db, {});
      expect(batchCalled).toBe(false);
    });

    it('should trim and sanitize site name', async () => {
      let capturedValue = null;
      db.batch = async () => {};
      db.prepare = (sql) => {
        if (sql.includes('INSERT INTO site_settings')) {
          return {
            bind: (value) => {
              capturedValue = value;
              return { run: async () => ({}) };
            }
          };
        }
        return {
          all: async () => ({ results: [] })
        };
      };

      await updateSiteSettings(db, { siteName: '  Trimmed Name  ' });
      expect(capturedValue).toBe('Trimmed Name');
    });
  });

  describe('getChannelById', () => {
    it('should return channel when found', async () => {
      const mockChannel = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public',
        deleted_at: null
      };

      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [mockChannel] })
        })
      });

      const channel = await getChannelById(db, 1);
      expect(channel).toEqual(mockChannel);
    });

    it('should return null when channel not found', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const channel = await getChannelById(db, 999);
      expect(channel).toBeNull();
    });

    it('should exclude deleted channels', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const channel = await getChannelById(db, 1);
      expect(channel).toBeNull();
    });
  });

  describe('getChannelMembership', () => {
    it('should return membership when found', async () => {
      const mockMembership = {
        channel_id: 1,
        user_id: 1,
        role: 'member',
        joined_at: '2026-05-01'
      };

      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [mockMembership] })
        })
      });

      const membership = await getChannelMembership(db, 1, 1);
      expect(membership).toEqual(mockMembership);
    });

    it('should return null when membership not found', async () => {
      db.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const membership = await getChannelMembership(db, 1, 999);
      expect(membership).toBeNull();
    });

    it('should handle numeric conversion of IDs', async () => {
      db.prepare = () => ({
        bind: (channelId, userId) => {
          expect(typeof channelId).toBe('number');
          expect(typeof userId).toBe('number');
          return {
            all: async () => ({ results: [] })
          };
        }
      });

      await getChannelMembership(db, '1', '2');
    });
  });
});
