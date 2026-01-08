import { Aircraft } from '@atc/shared';

/**
 * AirNavigationManager - Handles air movement physics for Phase 6
 * 
 * Responsibilities:
 * - Lateral navigation (heading changes, direct-to navigation)
 * - Vertical navigation (climb/descent)
 * - Speed management
 */
export class AirNavigationManager {
    // Standard turn rate: 3 degrees per second
    private readonly STANDARD_TURN_RATE = 3;

    // Climb/descent rates
    private readonly DEFAULT_CLIMB_RATE = 1500;  // fpm
    private readonly DEFAULT_DESCENT_RATE = 1000; // fpm

    // Speed limits
    private readonly MAX_SPEED = 250; // kts below 10,000
    private readonly MIN_APPROACH_SPEED = 120; // kts

    /**
     * Update aircraft's heading toward target
     * Returns the new heading after dt seconds
     */
    public updateHeading(currentHeading: number, targetHeading: number, dt: number): number {
        // Calculate signed difference (-180 to +180) for shortest path
        let diff = targetHeading - currentHeading;
        // Normalize to -180 to +180
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        const maxTurn = this.STANDARD_TURN_RATE * dt;

        if (Math.abs(diff) <= maxTurn) {
            return this.normalizeAngle(targetHeading);
        }

        const turnDirection = diff > 0 ? 1 : -1;
        return this.normalizeAngle(currentHeading + turnDirection * maxTurn);
    }

    /**
     * Update aircraft's altitude toward target
     * Returns the new altitude and vertical rate
     */
    public updateAltitude(
        currentAlt: number,
        targetAlt: number,
        currentRate: number,
        dt: number
    ): { altitude: number; verticalRate: number } {
        if (currentAlt === targetAlt) {
            return { altitude: currentAlt, verticalRate: 0 };
        }

        const isClimbing = targetAlt > currentAlt;
        const desiredRate = isClimbing ? this.DEFAULT_CLIMB_RATE : -this.DEFAULT_DESCENT_RATE;

        // Apply vertical rate
        const altChange = desiredRate * (dt / 60); // fpm to feet per dt
        let newAlt = currentAlt + altChange;

        // Check if we've reached target
        if ((isClimbing && newAlt >= targetAlt) || (!isClimbing && newAlt <= targetAlt)) {
            return { altitude: targetAlt, verticalRate: 0 };
        }

        return { altitude: newAlt, verticalRate: desiredRate };
    }

    /**
     * Update aircraft's speed toward target
     * Returns the new speed
     */
    public updateSpeed(currentSpeed: number, targetSpeed: number, dt: number): number {
        // Acceleration/deceleration rate (knots per second)
        const accelRate = 5;
        const decelRate = 3;

        if (currentSpeed === targetSpeed) {
            return currentSpeed;
        }

        const isAccelerating = targetSpeed > currentSpeed;
        const rate = isAccelerating ? accelRate : -decelRate;
        const deltaSpeed = rate * dt;

        let newSpeed = currentSpeed + deltaSpeed;

        // Check if we've reached target
        if ((isAccelerating && newSpeed >= targetSpeed) || (!isAccelerating && newSpeed <= targetSpeed)) {
            return targetSpeed;
        }

        return Math.max(0, newSpeed);
    }

    /**
     * Calculate bearing from position to target fix
     */
    public bearingToFix(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        const lon1Rad = lon1 * Math.PI / 180;
        const lon2Rad = lon2 * Math.PI / 180;

        const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;

        return this.normalizeAngle(bearing);
    }

    /**
     * Calculate distance to fix in nautical miles
     */
    public distanceToFix(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 3440.065; // Earth radius in nautical miles
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Move aircraft forward based on speed and heading
     * Returns new lat/lon position
     */
    public moveForward(
        lat: number,
        lon: number,
        heading: number,
        speedKts: number,
        dt: number
    ): { lat: number; lon: number } {
        // Convert speed to distance (nautical miles)
        const distNm = speedKts * (dt / 3600);

        // Convert to degrees (1 nm ≈ 1/60 degree at equator)
        const distDeg = distNm / 60;

        // Calculate new position
        const headingRad = heading * Math.PI / 180;
        const newLat = lat + distDeg * Math.cos(headingRad);
        const newLon = lon + distDeg * Math.sin(headingRad) / Math.cos(lat * Math.PI / 180);

        return { lat: newLat, lon: newLon };
    }

    /**
     * Normalize angle to 0-360 range
     */
    private normalizeAngle(angle: number): number {
        return ((angle % 360) + 360) % 360;
    }

    /**
     * Check if aircraft has reached a fix (within threshold)
     */
    public hasReachedFix(lat: number, lon: number, fixLat: number, fixLon: number): boolean {
        const distNm = this.distanceToFix(lat, lon, fixLat, fixLon);
        return distNm < 0.5; // 0.5 nm threshold
    }
}
