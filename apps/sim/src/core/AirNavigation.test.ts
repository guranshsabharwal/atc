import { describe, expect, test, beforeEach } from 'vitest';
import { AirNavigationManager } from './AirNavigationManager';

describe('AirNavigationManager', () => {
    let airNav: AirNavigationManager;

    beforeEach(() => {
        airNav = new AirNavigationManager();
    });

    describe('updateHeading', () => {
        test('turns right toward target heading', () => {
            const result = airNav.updateHeading(90, 120, 10); // 10 seconds
            expect(result).toBeCloseTo(120, 0); // Should reach target with 3°/sec for 10 sec
        });

        test('turns left toward target heading', () => {
            // From 90 to 60 is -30 degrees, 10 sec at 3 deg/sec = 30 deg turn max
            const result = airNav.updateHeading(90, 60, 10);
            expect(result).toBeCloseTo(60, 0); // Should reach target
        });

        test('maintains heading when at target', () => {
            const result = airNav.updateHeading(180, 180, 10);
            expect(result).toBe(180);
        });

        test('limits turn rate to 3 degrees per second', () => {
            const result = airNav.updateHeading(90, 180, 1); // 1 second
            expect(result).toBeCloseTo(93, 0); // Only +3 degrees
        });

        test('handles wraparound from 350 to 10', () => {
            const result = airNav.updateHeading(350, 10, 10);
            expect(result).toBeCloseTo(10, 0); // Should go clockwise
        });
    });

    describe('updateAltitude', () => {
        test('climbs toward target altitude', () => {
            const result = airNav.updateAltitude(2000, 5000, 0, 60);
            expect(result.altitude).toBeGreaterThan(2000);
            expect(result.verticalRate).toBeGreaterThan(0);
        });

        test('descends toward target altitude', () => {
            const result = airNav.updateAltitude(5000, 2000, 0, 60);
            expect(result.altitude).toBeLessThan(5000);
            expect(result.verticalRate).toBeLessThan(0);
        });

        test('levels off at target altitude', () => {
            const result = airNav.updateAltitude(3000, 3000, 0, 60);
            expect(result.altitude).toBe(3000);
            expect(result.verticalRate).toBe(0);
        });

        test('stops at exact target altitude when close', () => {
            const result = airNav.updateAltitude(2990, 3000, 1500, 60);
            expect(result.altitude).toBe(3000);
            expect(result.verticalRate).toBe(0);
        });
    });

    describe('updateSpeed', () => {
        test('accelerates toward target speed', () => {
            const result = airNav.updateSpeed(150, 200, 10);
            expect(result).toBeGreaterThan(150);
        });

        test('decelerates toward target speed', () => {
            const result = airNav.updateSpeed(200, 150, 10);
            expect(result).toBeLessThan(200);
        });

        test('maintains speed when at target', () => {
            const result = airNav.updateSpeed(180, 180, 10);
            expect(result).toBe(180);
        });
    });

    describe('bearingToFix', () => {
        test('calculates bearing north', () => {
            const bearing = airNav.bearingToFix(38.0, -77.0, 39.0, -77.0);
            expect(bearing).toBeCloseTo(0, 0);
        });

        test('calculates bearing east', () => {
            const bearing = airNav.bearingToFix(38.0, -77.0, 38.0, -76.0);
            expect(bearing).toBeCloseTo(90, 0);
        });
    });

    describe('distanceToFix', () => {
        test('calculates distance correctly', () => {
            // Approximately 1 degree of latitude = 60 nm
            const dist = airNav.distanceToFix(38.0, -77.0, 39.0, -77.0);
            expect(dist).toBeCloseTo(60, 0);
        });
    });

    describe('moveForward', () => {
        test('moves aircraft north', () => {
            const result = airNav.moveForward(38.0, -77.0, 0, 60, 1); // 60 kts for 1 second
            expect(result.lat).toBeGreaterThan(38.0);
            expect(result.lon).toBeCloseTo(-77.0, 4);
        });

        test('moves aircraft east', () => {
            const result = airNav.moveForward(38.0, -77.0, 90, 60, 1);
            expect(result.lat).toBeCloseTo(38.0, 4);
            expect(result.lon).toBeGreaterThan(-77.0);
        });
    });

    describe('hasReachedFix', () => {
        test('returns true when within 0.5nm', () => {
            const result = airNav.hasReachedFix(38.0, -77.0, 38.005, -77.0);
            expect(result).toBe(true);
        });

        test('returns false when far from fix', () => {
            const result = airNav.hasReachedFix(38.0, -77.0, 39.0, -77.0);
            expect(result).toBe(false);
        });
    });
});
