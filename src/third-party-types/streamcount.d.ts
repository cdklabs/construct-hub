declare module "streamcount" {

  function createUniquesCounter(stdError?: number): HyperLogLog;

  class HyperLogLog {
    /**
     * Create an HLL instance with a given allowed error fraction (default 0.01 or 1%)
     */
    constructor(stdError?: number);

    /**
     * Add a string to the counter
     */
    add(x: string): void;

    /**
     * Return the count estimate
     */
    count(): number;

    /**
     * Return the current state of the HLL as a Buffer
     */
    serialize(): Buffer;

    /**
     * Merge another HLL into this one
     */
    merge(hll: HyperLogLog): void;

    /**
     * Deserialize an HLL from a Buffer
     */
    static deserialize(state: Buffer): HyperLogLog;
  }
}