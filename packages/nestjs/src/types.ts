/**
 * Enforces that a NestJS controller class implements all methods from a contract,
 * with matching return types. Parameter types are intentionally loose (`any[]`)
 * because NestJS injects parameters via its own decorator system at runtime.
 *
 * @example
 * \@Controller(userApi.subRoute ?? '/')
 * export class UserController implements TypedController<UserApi> {
 *   async getAll(): Promise<User[]> { ... }
 * }
 */
export type TypedController<TContract> = {
    [K in keyof TContract]: TContract[K] extends (...args: any[]) => infer R
    ? (...args: any[]) => R
    : never;
};
