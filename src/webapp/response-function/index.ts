import * as cloudfront from '@aws-cdk/aws-cloudfront';
import { Construct } from '@aws-cdk/core';

export interface ResponseFunctionProps extends Partial<cloudfront.FunctionProps> {
  readonly responseHeaders?: { [key: string]: string };
}

export class ResponseFunction extends cloudfront.Function {
  constructor(scope: Construct, id: string, props: ResponseFunctionProps = {}) {
    super(scope, id, {
      code: cloudfront.FunctionCode.fromInline(generateHandler(props.responseHeaders ?? {})),
      ...props,
    });
  }
}

function generateHandler(headers: { [key: string]: string }): string {
  const code = new Code();
  code.open('function handler(event) {');
  code.line('var response = event.response;');
  code.line('var headers = response.headers;');
  for (const [key, value] of Object.entries(headers)) {
    code.line(`headers["${key}"] = { value: "${value}" };`);
  }
  code.line('return response;');
  code.close('}');
  return code.render();
};

class Code {
  private indentLevel = 0;
  private lines: string[] = [];

  constructor() {}

  public line(code?: string) {
    const spaces: number = 2 * this.indentLevel;
    const prefix = ' '.repeat(spaces);
    this.lines.push((prefix + (code ?? '')).trimEnd());
  }

  public open(code?: string) {
    if (code) {
      this.line(code);
    }
    this.indentLevel++;
  }

  public close(code?: string) {
    if (this.indentLevel === 0) {
      throw new Error('Cannot decrease indent level below zero');
    }
    this.indentLevel--;
    if (code) {
      this.line(code);
    }
  }

  public render(): string {
    return this.lines.join('\n');
  }
}
