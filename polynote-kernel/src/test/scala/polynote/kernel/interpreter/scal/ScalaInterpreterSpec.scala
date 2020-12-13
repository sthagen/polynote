package polynote.kernel.interpreter
package scal

import cats.data.StateT
import cats.syntax.traverse._
import cats.instances.list._
import org.scalatest.{FreeSpec, Matchers}
import polynote.kernel.{Completion, CompletionType, Output, Result, ResultValue, ScalaCompiler, TaskInfo}
import polynote.testing.{InterpreterSpec, ValueMap, ZIOSpec}
import polynote.messages.CellID
import zio.{RIO, ZIO, ZLayer}
import zio.blocking.Blocking
import zio.clock.Clock
import zio.console.Console
import zio.interop.catz._
import zio.random.Random
import zio.system.System

import scala.collection.mutable.ListBuffer
import scala.reflect.internal.util.AbstractFileClassLoader
import scala.reflect.io.VirtualDirectory
import scala.tools.nsc.Settings

class ScalaInterpreterSpec extends FreeSpec with Matchers with InterpreterSpec {

  val interpreter: ScalaInterpreter = ScalaInterpreter().provideSomeLayer[Environment](ZLayer.succeed(compiler)).runIO()
  import interpreter.ScalaCellState


  "run scala code" in {
    val result = interp1("val foo = 22")
    ValueMap(result.state.values) shouldEqual Map("foo" -> 22)
  }

  "capture standard output" - {
    "single-line string" in {
      val result = interp1("""println("hello")""")
      stdOut(result.env.publishResult.toList.runIO()) shouldEqual "hello\n"
    }

    "multi-line string" in {
      val result = interp1(
        s"""println(">>>Multi-line string")
          |println(${"\"\"\""}A: 1
          |    |B: 2
          |    |C: 3${"\"\"\""}.stripMargin)
          |""".stripMargin)
      stdOut(result.env.publishResult.toList.runIO()) shouldEqual
        """>>>Multi-line string
          |A: 1
          |B: 2
          |C: 3
          |""".stripMargin
    }
  }

  "bring values from previous cells" - {
    "when referenced directly" in {
      val test = for {
        res1 <- interp("val foo = 22")
        res2 <- interp("val bar = foo + 10")
      } yield (res1, res2)

      val (finalState, (res1, res2)) = test.run(cellState).runIO()

      res2.state.values match {
        case ValueMap(values) => values("bar") shouldEqual 32
      }
    }
    "when referenced by type only" in {
      val test = for {
        res1 <- interp("class Foo")
        res2 <- interp("val fooCls = classOf[Foo]")
        res3 <- interp("object Bar { class Baz }")
        res4 <- interp("val bazCls = classOf[Bar.Baz]")
//        res5 <- interp("val bar = Bar")
//        res6 <- interp("val barBazCls = classOf[bar.Baz]")
      } yield (res2, res4 /* , res6 */)

      val (finalState, res) = test.run(cellState).runIO()

      (res._1.state.values ++ res._2.state.values /* ++ res._3.state.values */) match {
        case ValueMap(values) =>
          values("fooCls").toString.contains("$Foo") shouldBe true
          values("bazCls").toString.contains("$Bar$Baz") shouldBe true
//          values("barBazCls").toString.contains("$Bar$Baz") shouldBe true
      }
    }
  }

  "minimizes dependencies" in {
    val test = for {
      res1 <- interp("val foo = 22\nval wizzle = true")
      res2 <- interp("val bar = foo + 10")
    } yield (res1, res2)

    val (finalState, (res1, res2)) = test.run(cellState).runIO()

    res2.state match {
      case state: ScalaCellState =>
        state.cellCode.inputs.count(_.name.toString != "kernel") shouldEqual 1 // foo but not wizzle
        state.cellCode.priorCells.size shouldEqual 0 // doesn't depend on any prior cell instance
    }
  }

  "keep imports from previous cells" - {
    "external imports" in {
      val test = for {
        res1 <- interp(
          """import scala.collection.mutable.ListBuffer
            |val foo = ListBuffer("hi")""".stripMargin)
        res2 <- interp("val bar = ListBuffer(22)")
      } yield (res1, res2)

      val (finalState, (res1, res2)) = test.run(cellState).runIO()
      res1.state.values match {
        case ValueMap(values) => values("foo") shouldEqual ListBuffer("hi")
      }

      res2.state.values match {
        case ValueMap(values) => values("bar") shouldEqual ListBuffer(22)
      }
    }

    "imports of dependent values" in {
      val test = for {
        res1 <- interp("object Foo { val thing = 10 }")
        res2 <- interp("import Foo.thing\nval hey = thing + 2")
        res3 <- interp("val hooey = thing + 12")
      } yield (res1, res2, res3)

      val (finalState, (res1, res2, res3)) = test.run(cellState).runIO()

      val hooey = res3.state.values.head
      hooey.name shouldEqual "hooey"
      hooey.typeName shouldEqual "Int"
      hooey.value shouldEqual 22
    }
  }

  "package cells" - {
    "imports classes" in {
      val test = for {
        _ <- interp("package foo\nclass Foo(a: Int, b: String) { def bar = a + b.length }")
        _ <- interp("""val a = new Foo(10, "hi")""")
        _ <- interp("val b = a.bar")
      } yield ()

      val (finalState, _) = test.run(cellState).runIO()
      val scopeMap = finalState.scope.map(r => r.name.toString -> r.value).toMap
      scopeMap("b") shouldEqual 12
    }

    "imports objects" in {
      val test = for {
        _ <- interp("package fooObj\nobject Foo { def wizzle = 20 }")
        _ <- interp("val a = Foo.wizzle")
      } yield ()

      val (finalState, _) = test.run(cellState).runIO()
      val scopeMap = finalState.scope.map(r => r.name.toString -> r.value).toMap
      scopeMap("a") shouldEqual 20
    }

    "case classes (class with companion)" in {
      val test = for {
        _ <- interp("package fooCaseClass\ncase class Foo(a: Int, b: Int)")
        _ <- interp("val a = Foo(10, 20)")
        _ <- interp("val c = classOf[Foo]")
        _ <- interp("val b = a.b")
      } yield ()

      val (finalState, _) = test.run(cellState).runIO()
      val scopeMap = finalState.scope.map(r => r.name.toString -> r.value).toMap
      scopeMap("b") shouldEqual 20
    }

    "class with explicit companion" in {
      val test = for {
        _ <- interp(
          """package explicitCompanion
            |sealed abstract class TestClass { def m = 10 }
            |object TestClass extends TestClass""".stripMargin)
        _ <- interp("val result = TestClass.m")
        _ <- interp("val cls = classOf[TestClass]")
      } yield ()

      val (finalState, _) = test.run(cellState).runIO()
      val scopeMap = finalState.scope.map(r => r.name.toString -> r.value).toMap
      scopeMap("result") shouldEqual 10
      scopeMap("cls").asInstanceOf[Class[_]].getSimpleName shouldEqual "TestClass"
    }
  }

  /**
    * This test takes a while, so it's disabled by default. The purpose is to make sure that the cell encoding
    * doesn't fail at the typer stage before the constructor arguments are pruned, because there's at least one
    * constructor argument for each previous cell at that point.
    *
    * The time overhead does grow as the cell count grows, but in this test the cell i=256 takes only 0.1 seconds to run
    * (on my laptop - JS) compared to 0.01 seconds for cell i=1, so it's not a hugely burdensome thing. The entire test
    * takes about 1m45s (around half a second for each cell on average), so there is some other overhead going on, but
    * it doesn't seem to be in the Scala interpreter itself.
    */
  "doesn't fail after really running 256 cells" ignore {
    val (finalState, results) = (0 to 256).toList.map {
      i => interp(s"val foo$i = $i").transformF {
        task => for {
          _      <- ZIO.effectTotal(println(s"Starting cell $i"))
          start  <- zio.clock.nanoTime
          result <- task
          end    <- zio.clock.nanoTime
          _      <- ZIO.effectTotal(println(s"Cell $i took ${(end - start).toDouble / 10e9} seconds"))
        } yield result
      }
    }.sequence.run(State.id(0)).runIO()
  }

  /**
    * A quick version of the above; doesn't actually *run* 256 cells, just creates a state chain to put 256 result values
    * into scope and runs one cell in that state
    */
  "doesn't fail after 256 cells" in {
    val prevState = (0 to 256).foldLeft(State.root) {
      (prev, i) => State.id(i, prev, List(ResultValue(s"foo$i", "Int", Nil, CellID(i), i, compiler.global.typeOf[Int], None)))
    }

    val (finalState, results) = interp("val foo257 = 257").run(State.id(257, prevState)).runIO()
    ValueMap(results.state.values) shouldEqual Map("foo257" -> 257)
    ValueMap(results.state.scope) shouldEqual (0 to 257).map(i => s"foo$i" -> i).toMap
  }

  "lazy vals don't crash" in {
    val test = for {
      _ <- interp("lazy val x = 10")
      _ <- interp("val y = x * 2")
    } yield ()
    val (finalState, _) = test.run(cellState).runIO()
    ValueMap(finalState.scope)("y") shouldEqual 20
  }

  "cases from previous scala interpreter" - {
    "allow values to be overridden" in {
      val code = Seq(
        "val a: Int = 100",
        "val a: Int = 200",
        "val b = a"
      )
      assertOutput(code) {
        case (vars, output) =>
          vars("a") shouldEqual 200
          vars("b") shouldEqual 200
      }
    }

    "be able to display html using the kernel runtime reference" in {
      val code = """kernel.display.html("hi")"""
      assertOutput(code) {
        (vars, output) =>
          vars.toSeq shouldBe empty
          output should contain only Output("text/html", "hi")
      }
    }

    "properly return vals declared by scala code" in {
      val code =
        """
          |val x = 1
          |val y = "foo"
          |class MyNewClass
          |val z = new MyNewClass()
          |val l = List(x, y, Map("sup?" -> "nm"), false)
          |val l2 = List(100, l)
          |val m = Map(x -> y, y -> 100, "hey!" -> l2)
          |val m2 = Map("hm" -> m, "humm" -> m)
      """.stripMargin
      assertOutput(code) {
        (vars, output) =>
          vars.toSeq.filterNot(_._1 == "z") should contain theSameElementsAs Seq(
            "x" -> 1,
            "y" -> "foo",
            "l" -> List(1, "foo", Map("sup?" -> "nm"), false),
            "l2" -> List(100, List(1, "foo", Map("sup?" -> "nm"), false)),
            "m" -> Map(1 -> "foo", "foo" -> 100, "hey!" ->  List(100, List(1, "foo", Map("sup?" -> "nm"), false))),
            "m2" -> Map(
              "hm" -> Map(1 -> "foo", "foo" -> 100, "hey!" ->  List(100, List(1, "foo", Map("sup?" -> "nm"), false))),
              "humm" -> Map(1 -> "foo", "foo" -> 100, "hey!" ->  List(100, List(1, "foo", Map("sup?" -> "nm"), false))))
          )
          vars("z").toString should include("$MyNewClass")
          output shouldBe empty
      }
    }

    "assign a value to result of code if it ends in an expression" in {
      val code =
        """
          |val x = 1
          |val y = 2
          |x + y
      """.stripMargin
      assertOutput(code) {
        (vars, output) =>
          vars.toSeq should contain theSameElementsAs Seq(
            "x" -> 1,
            "y" -> 2,
            "Out" -> 3
          )

          output shouldBe empty
      }
    }

    "capture all output of the code" in {
      val code =
        """
          |val x = 1
          |val y = 2
          |println(s"println: $x + $y = ${x + y}")
          |System.out.println(s"sys: $x + $y = ${x + y}")
          |val answer = x + y
          |answer
      """.stripMargin
      assertOutput(code) {
        (vars, output) =>
          vars.toSeq should contain theSameElementsAs Seq(
            "x" -> 1,
            "y" -> 2,
            "answer" -> 3,
            "Out" -> 3
          )
          stdOut(output) shouldEqual
            """println: 1 + 2 = 3
              |sys: 1 + 2 = 3
              |""".stripMargin
      }
    }

    "not bother to return any value if the code just prints" in {
      val code =
        """
          |println("Do you like muffins?")
      """.stripMargin
      assertOutput(code) {
        (vars, output) =>
          vars shouldBe empty
          stdOut(output) shouldEqual "Do you like muffins?\n"
      }
    }

    "support destructured assignment" in {
      val code =
        """
          |val (foo, bar) = 1 -> "one"
      """.stripMargin

      assertOutput(code) {
        (vars, output) =>
          vars.toSeq should contain theSameElementsAs List("foo" -> 1, "bar" -> "one")
      }
    }

  }

  "completions" - {
    def completionsMap(code: String, pos: Int, state: State = cellState) =
      interpreter.completionsAt(code, pos, state).runIO().groupBy(_.name.toString)

    "complete class defined in cell" in {
      val code = """class Foo() {
                   |  def someMethod(): Int = 22
                   |}
                   |
                   |val test = new Foo()
                   |test.""".stripMargin
      val completions = completionsMap(code, code.length)
      val List(someMethod) = completions("someMethod")
      someMethod.completionType shouldEqual CompletionType.Method
      someMethod.resultType shouldEqual "Int"
    }

    "inside apply trees" - {
      "one level deep" in {
        val code =
          """class Foo() { def someMethod(): Int = 22 }
            |val test = new Foo()
            |val result = println(test.)
            |""".stripMargin
        val completions = completionsMap(code, code.indexOf("test.") + "test.".length)
        val List(someMethod) = completions("someMethod")
        someMethod.completionType shouldEqual CompletionType.Method
        someMethod.resultType shouldEqual "Int"
      }
    }

    "imported method" in {
      val state = interp1("import scala.math.log10").state
      val completions = completionsMap("l", 1, State.id(2, state))
      val List(log10) = completions("log10")
      log10.completionType shouldEqual CompletionType.Method
      log10.resultType shouldEqual "Double"
    }

    "extension methods" in {
      val state = interp1("import scala.collection.JavaConverters._").state
      val code = "List(1, 2, 3).asJ"
      val completions = completionsMap(code, code.length, State.id(2, state))
      val List(asJava) = completions("asJava")
      asJava.completionType shouldEqual CompletionType.Method
      asJava.resultType shouldEqual "List[Int]"
    }

    "value from previous cell" in {
      val state = interp1("val shouldBeVisible = 10").state
      val code = "val butIsIt = sh"
      val completions = completionsMap(code, code.length, State.id(2, state))
      val List(shouldBeVisible) = completions("shouldBeVisible")
      shouldBeVisible.completionType shouldEqual CompletionType.Term
      shouldBeVisible.resultType shouldEqual "Int"
    }

    "from class indexer" - {
      "imports" in {
        val code = "import HashM"
        interpreter.awaitIndexer.runIO()
        val completions = completionsMap(code, code.length, State.id(1))
        val expected = Completion("HashMap", Nil, Nil, "scala.c.immutable", CompletionType.Unknown, Some("scala.collection.immutable.HashMap"))
        completions("HashMap") should contain (expected)
      }
    }

  }



}
