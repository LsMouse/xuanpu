import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'src/server/schema/**/*.graphql',
  generates: {
    'src/server/__generated__/resolvers-types.ts': {
      plugins: [
        { add: { content: '/* eslint-disable @typescript-eslint/no-explicit-any */' } },
        'typescript',
        'typescript-resolvers'
      ],
      config: {
        contextType: '../context#GraphQLContext',
        mappers: {},
        useIndexSignature: true,
        enumsAsTypes: true,
        scalars: {
          JSON: 'unknown'
        }
      }
    }
  }
}

export default config
