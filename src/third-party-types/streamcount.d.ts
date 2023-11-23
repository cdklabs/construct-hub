declare module "streamcount" {

  function createUniquesCounter(stdError?: number): HyperLogLog;

  interface HyperLogLog {
    /**
     * Add a string to the counter
     */
    add(x: string): void;

    /**
     * Return the count estimate (will be a floating point number!)
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
     * This is private. Don't touch it, but it can be used to recognize the type (HyperLogLog is not a class, unfortunately)
     */
    M: number[];
  }

  namespace HyperLogLog {
    /**
     * Deserialize an HLL from a Buffer
     */
    function deserialize(state: Buffer): HyperLogLog;
  }
}