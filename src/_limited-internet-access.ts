import { createHash } from 'crypto';
import * as fs from 'fs';
import { resolve, join } from 'path';
import {
  IVpc,
  ISecurityGroup,
  SecurityGroup,
  Port,
  Peer,
  IPeer,
  Connections,
  CfnPrefixList,
} from '@aws-cdk/aws-ec2';
import { Construct, Tags } from '@aws-cdk/core';
import { S3PrefixList } from './s3';

/**
 * Creates SecurityGroups where "sensitive" operations should be listed,
 * which only allows DNS requests to be issued within the VPC (to the local
 * Route53 resolver), as well as HTTPS (port 443) traffic to:
 * - allow-listed IP ranges
 * - endpoints within the same SecurityGroup.
 *
 * This returns MULTIPLE security groups in order to avoid hitting the maximum
 * count of rules per security group, which is relatively low, and prefix
 * lists count as their expansions.
 *
 * There is also a limit of how many security groups can be bound to a network
 * interface (defaults to 5), so there is only so much we can do here.
 *
 * @param scope the scope in which to attach new constructs.
 * @param vpc the VPC in which a SecurityGroup is to be added.
 */
export function createRestrictedSecurityGroups(
  scope: Construct,
  vpc: IVpc
): ISecurityGroup[] {
  const securityGroups = new Array<ISecurityGroup>();

  securityGroups.push(createInternalTrafficSecurityGroup(scope, vpc));

  const ALLOW_LIST_DIR = resolve(
    __dirname,
    '..',
    'resources',
    'vpc-allow-lists'
  );
  for (const file of fs.readdirSync(ALLOW_LIST_DIR)) {
    const matches = /^(.+)-(IPv4|IPv6)\.txt$/.exec(file);
    if (matches == null) {
      throw new Error(
        `Allow-list file ${file} in ${ALLOW_LIST_DIR} is invalid: file name must end in IPv4.txt or IPv6.txt`
      );
    }
    const [, namespace, ipLabel] = matches;

    const entries = parsePrefixList(join(ALLOW_LIST_DIR, file));

    if (entries.length === 0) {
      continue;
    }

    // We use a SHA-1 digest of the list of prefixes to be sure we create a
    // whole new prefix list whenever it changes, so we are never bothered by
    // the maxEntries being what it is.
    const hash = entries
      .reduce((h, { cidr }) => h.update(cidr).update('\0'), createHash('SHA1'))
      .digest('hex');

    // Note - the `prefixListName` is NOT a physical ID, and so updating it
    // will NOT cause a replacement. Additionally, it needs not be unique in
    // any way.
    const pl = new CfnPrefixList(scope, `${namespace}.${ipLabel}#${hash}`, {
      addressFamily: ipLabel,
      prefixListName: `${namespace}.${ipLabel}`,
      entries,
      maxEntries: entries.length,
    });
    // Note: the CfnPrefixList above uses a `.` separator bewteen namespace and
    // ipLabel, since we use a `-` here, we are not colliding. The has is used
    // here to replace the SG when the PL is updated. Failure to do so may
    // result in the SG having both the old & updated PLs in its rule set until
    // the CloudFormation clean-up phase completes, which might exceed the
    // maximum amount of rules allowed on a SG.
    const descr = `${namespace}-${ipLabel}`;
    const sg = new SecurityGroup(scope, `${descr}#${hash}`, {
      allowAllOutbound: false,
      description: `${scope.node.path}/${descr}`,
      vpc,
    });

    // We intentionally ONLY allow HTTPS though there...
    sg.connections.allowTo(
      NamedPeer.from(Peer.prefixList(pl.attrPrefixListId), pl.node.path),
      Port.tcp(443),
      `to ${namespace} (${ipLabel})`
    );

    Tags.of(sg).add('Name', `${namespace}.${ipLabel}`);

    securityGroups.push(sg);
  }

  return securityGroups;
}

/**
 * Creates a SecurityGroup that allows traffic to flow freely between
 * endpoints within itself on port 443, to the local Route53 resolver on DNS
 * ports, and to the region's AW S3 prefix list on port 443.
 *
 * @param scope the scope in which to attach the new Security Group.
 * @param vpc the VPC in which the SecurityGroup will be created.
 */
function createInternalTrafficSecurityGroup(
  scope: Construct,
  vpc: IVpc
): ISecurityGroup {
  const sg = new SecurityGroup(scope, 'InternalTraffic', {
    allowAllOutbound: false,
    description: `${scope.node.path}/SG`,
    vpc,
  });

  // Allow all traffic within the security group on port 443
  sg.connections.allowInternally(
    Port.tcp(443),
    'Traffic within this SecurityGroup'
  );

  // Allow access to S3. This is needed for the S3 Gateway endpoint to work.
  sg.connections.allowTo(
    NamedPeer.from(
      Peer.prefixList(new S3PrefixList(scope, 'S3-PrefixList').prefixListId),
      'AWS S3'
    ),
    Port.tcp(443),
    'to AWS S3'
  );

  // Allow making DNS requests, there should be a Route53 resolver wihtin the VPC.
  sg.connections.allowTo(
    Peer.ipv4(vpc.vpcCidrBlock),
    Port.tcp(53),
    'to Route53 DNS resolver'
  );
  sg.connections.allowTo(
    Peer.ipv4(vpc.vpcCidrBlock),
    Port.udp(53),
    'to Route53 DNS resolver'
  );

  return sg;
}

/**
 * Parses the PrefixList in the designated path.
 *
 * @param filePath the file containing the prefix list.
 */
export function parsePrefixList(filePath: string): CidrBlock[] {
  return (
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => {
        const match = /^\s*([^\s]+)?\s*(?:#.*)?$/.exec(line);
        if (!match) {
          throw new Error(`Invalid line in allow list ${filePath}: ${line}`);
        }
        const [, cidr] = match;
        return cidr;
      })
      // Remove empty lines.
      .filter((cidr) => !!cidr)
      .sort()
      .map((cidr) => ({ cidr }))
  );
}

interface CidrBlock {
  readonly cidr: string;
}

/**
 * This is to work around an issue where the peer's `uniqueId` is a token for
 * our PrefixList values, and this causes the VPC construct to "de-duplicate"
 * all of them (it considers they are identical).
 *
 * There is a fix in the latest EC2 library, however that fix isn't great
 * either, as it addresses the problem at the wrong location (in the in/egress
 * rule, instead of in the peer).
 *
 * Basically, this ensures the `uniqueId` is some string we control, so we
 * remain faithful to the declaraiton intent.
 */
class NamedPeer implements IPeer {
  public static from(peer: IPeer, name: string) {
    return new NamedPeer(peer, name);
  }

  public readonly connections: Connections = new Connections({ peer: this });

  private constructor(
    private readonly peer: IPeer,
    public readonly uniqueId: string
  ) {}

  public get canInlineRule() {
    return this.peer.canInlineRule;
  }

  public toIngressRuleConfig() {
    return this.peer.toIngressRuleConfig();
  }

  public toEgressRuleConfig() {
    return this.peer.toEgressRuleConfig();
  }
}
