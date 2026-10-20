/*
 * Implémentation de référence de sfc32 (PractRand, Chris Doty-Humphrey, domaine public),
 * utilisée pour produire les vecteurs de test de packages/engine/src/core/rng.test.ts.
 * Compilation : cc -O2 -o sfc32-reference sfc32-reference.c && ./sfc32-reference
 */
#include <stdint.h>
#include <stdio.h>

typedef struct { uint32_t a, b, c, counter; } sfc32;

static uint32_t raw32(sfc32 *s) {
  uint32_t tmp = s->a + s->b + s->counter++;
  s->a = s->b ^ (s->b >> 9);
  s->b = s->c + (s->c << 3);
  s->c = ((s->c << 21) | (s->c >> 11)) + tmp;
  return tmp;
}

static void run(uint32_t a, uint32_t b, uint32_t c) {
  sfc32 s = {a, b, c, 1};
  for (int i = 0; i < 12; i++) raw32(&s);
  printf("seed(%u, %u, %u) state after warmup: [%u, %u, %u, %u]\n", a, b, c, s.a, s.b, s.c, s.counter);
  printf("  outputs:");
  for (int i = 0; i < 8; i++) printf(" %u", raw32(&s));
  printf("\n  state after 8 outputs: [%u, %u, %u, %u]\n", s.a, s.b, s.c, s.counter);
}

int main(void) {
  run(0u, 1u, 2u);
  run(0xdeadbeefu, 0x12345678u, 0xcafebabeu);
  run(0xffffffffu, 0xffffffffu, 0xffffffffu);
  return 0;
}
